import { createHash } from "node:crypto";

import { z } from "zod";

import { db } from "@/lib/db";
import { createThread, writeLogEntry } from "@/lib/log";
import { LOG_KIND_ORDER } from "@/lib/log-kinds";

import { findSimilarThread } from "./embed-entities";
import { isOpenAIAvailable, CHAT_MODEL, getOpenAI } from "./openai";
import { getIngestPrompt } from "./prompts";

// Server side of the session-end hook. The hook is a dumb pipe: it decides
// only whether a session *might* be Clerkr work (cheap path check) and POSTs
// the condensed transcript. Everything expensive and everything that needs a
// key — the relevance judgement, the extraction, dedupe, embedding — happens
// here, where OPENAI_API_KEY and the editable prompt already live.
//
// Two invariants:
//   1. Idempotent on the Claude session id. A hook that fires twice (resume,
//      retry, crash) must never double-log.
//   2. Never throws at the caller. A bad ingest records itself and returns.

const extractionSchema = z.object({
  relevant: z.boolean(),
  reason: z.string().nullish(),
  threadTitle: z.string().nullish(),
  threadDecision: z.string().nullish(),
  entries: z
    .array(
      z.object({
        // `.catch` keeps one bad kind from failing the whole extraction.
        kind: z.enum(LOG_KIND_ORDER as [string, ...string[]]).catch("NOTE"),
        body: z.string().min(1),
      }),
    )
    .default([]),
});

// Cosine similarity above which an extracted session joins an existing open
// thread instead of starting a new one.
const THREAD_ATTACH_THRESHOLD = 0.78;

export interface IngestInput {
  sessionId: string;
  transcript: string;
  cwd?: string | null;
  repo?: string | null;
  branch?: string | null;
  userId: string;
}

export interface IngestResult {
  status: "ingested" | "skipped" | "duplicate" | "unavailable" | "error";
  reason?: string;
  threadSlug?: string;
  threadCreated?: boolean;
  entriesCreated?: number;
}

export async function ingestSession(input: IngestInput): Promise<IngestResult> {
  const contentHash = createHash("sha256").update(input.transcript).digest("hex");

  const existing = await db.sessionIngest.findUnique({
    where: { sessionId: input.sessionId },
    select: { id: true, contentHash: true, relevant: true },
  });
  // Same session, same content — already handled. A session that kept going
  // after an earlier hook fire has a different hash and is allowed through.
  if (existing && existing.contentHash === contentHash) {
    return { status: "duplicate", reason: "This session was already ingested." };
  }

  if (!isOpenAIAvailable()) {
    await recordIngest(input, contentHash, {
      relevant: false,
      reason: "OPENAI_API_KEY not set — extraction skipped.",
    });
    return { status: "unavailable", reason: "OpenAI is not configured on the server." };
  }

  let parsed: z.infer<typeof extractionSchema>;
  try {
    parsed = await extract(input.transcript, input.cwd, input.repo, input.branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordIngest(input, contentHash, { relevant: false, reason: null, error: message });
    return { status: "error", reason: message };
  }

  if (!parsed.relevant || parsed.entries.length === 0) {
    const reason = parsed.reason ?? "Nothing durable in this session.";
    await recordIngest(input, contentHash, { relevant: false, reason });
    return { status: "skipped", reason };
  }

  // Attach to the nearest open thread, or open one from what the session was
  // actually about. Threads are the spine — a loose pile of entries with no
  // thread can't be rolled up later.
  const anchor = [parsed.threadTitle, parsed.threadDecision, parsed.entries[0]?.body]
    .filter(Boolean)
    .join("\n");

  let threadId: string | null = null;
  let threadSlug: string | undefined;
  let threadCreated = false;
  try {
    const match = anchor ? await findSimilarThread(anchor) : null;
    if (match && match.similarity >= THREAD_ATTACH_THRESHOLD) {
      threadId = match.id;
      threadSlug = match.slug;
    } else if (parsed.threadTitle) {
      const thread = await createThread({
        title: parsed.threadTitle,
        decision: parsed.threadDecision ?? null,
        why: null,
        authorId: input.userId,
      });
      threadId = thread.id;
      threadSlug = thread.slug;
      threadCreated = true;
    }
  } catch (err) {
    // Thread resolution is a nicety — entries still land unattached and can be
    // filed from /log. Losing them because the vector query failed would not.
    console.warn("[ingest] thread resolution failed:", err);
  }

  let entriesCreated = 0;
  for (const e of parsed.entries) {
    try {
      await writeLogEntry({
        body: e.body,
        kind: e.kind as never,
        threadId,
        source: "SESSION",
        sessionId: input.sessionId,
        repo: input.repo ?? null,
        branch: input.branch ?? null,
        reviewed: false, // lands in the /log review tray
        authorId: input.userId,
      });
      entriesCreated++;
    } catch (err) {
      console.warn("[ingest] entry write failed:", err);
    }
  }

  await recordIngest(input, contentHash, {
    relevant: true,
    reason: parsed.reason ?? null,
    entriesCreated,
    threadsCreated: threadCreated ? 1 : 0,
  });

  return { status: "ingested", threadSlug, threadCreated, entriesCreated };
}

async function extract(
  transcript: string,
  cwd?: string | null,
  repo?: string | null,
  branch?: string | null,
) {
  const client = getOpenAI();
  const context = [
    repo ? `Repo: ${repo}` : null,
    branch ? `Branch: ${branch}` : null,
    cwd ? `Working directory: ${cwd}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: await getIngestPrompt() },
      {
        role: "user",
        content: `${context}\n\nSession transcript:\n\n${transcript}`.trim(),
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("The model did not return valid JSON.");
  }
  return extractionSchema.parse(json);
}

async function recordIngest(
  input: IngestInput,
  contentHash: string,
  fields: {
    relevant: boolean;
    reason: string | null;
    entriesCreated?: number;
    threadsCreated?: number;
    error?: string;
  },
): Promise<void> {
  const data = {
    cwd: input.cwd ?? null,
    repo: input.repo ?? null,
    branch: input.branch ?? null,
    contentHash,
    relevant: fields.relevant,
    reason: fields.reason,
    entriesCreated: fields.entriesCreated ?? 0,
    threadsCreated: fields.threadsCreated ?? 0,
    transcriptChars: input.transcript.length,
    error: fields.error ?? null,
  };
  try {
    await db.sessionIngest.upsert({
      where: { sessionId: input.sessionId },
      update: data,
      create: { sessionId: input.sessionId, ...data },
    });
  } catch (err) {
    console.warn("[ingest] recordIngest failed:", err);
  }
}
