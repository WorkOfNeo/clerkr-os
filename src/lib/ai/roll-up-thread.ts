import { z } from "zod";

import { db } from "@/lib/db";
import { upsertFeatureFromIdea } from "@/lib/features";
import { LOG_KINDS } from "@/lib/log-kinds";

import { embedThread } from "./embed-entities";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { getRollupPrompt } from "./prompts";

// Closing a thread is the moment the log pays for itself: the whole stream of
// decisions, dead ends and ideas gets read once and turned into (a) an outcome
// you can hand your future self and (b) Feature Library rows for the ideas the
// work threw off. Mirrors the meeting-brief pipeline — JSON mode, zod-parsed,
// deduped against existing features.

const rollupSchema = z.object({
  outcome: z.string().min(1),
  ideas: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().nullish(),
        tags: z.array(z.string()).default([]),
        cluster: z.string().nullish(),
      }),
    )
    .default([]),
});

export interface RollUpResult {
  outcome: string;
  featuresCreated: number;
  featuresLinked: number;
}

export async function rollUpThread(
  threadId: string,
  finalState: "DONE" | "ABANDONED" = "DONE",
): Promise<RollUpResult> {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      decision: true,
      why: true,
      cluster: { select: { name: true } },
      entries: {
        orderBy: { occurredAt: "asc" },
        select: { id: true, kind: true, body: true, occurredAt: true, featureId: true },
      },
    },
  });
  if (!thread) throw new Error(`Thread not found: ${threadId}`);
  if (thread.entries.length === 0) {
    throw new Error("Nothing to roll up — this thread has no log entries yet.");
  }

  const stream = thread.entries
    .map(
      (e) =>
        `[${e.occurredAt.toISOString().slice(0, 10)}] ${LOG_KINDS[e.kind].label.toUpperCase()}: ${e.body}`,
    )
    .join("\n");

  const client = getOpenAI();
  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: await getRollupPrompt() },
      {
        role: "user",
        content:
          `Thread: ${thread.title}\n` +
          `Decision: ${thread.decision ?? "(not recorded)"}\n` +
          `Why: ${thread.why ?? "(not recorded)"}\n` +
          `Product area: ${thread.cluster?.name ?? "(none)"}\n` +
          `Final state: ${finalState}\n\n` +
          `Log entries (${thread.entries.length}):\n${stream}`,
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("The model did not return valid JSON. Try rolling up again.");
  }
  const parsed = rollupSchema.parse(json);

  await db.thread.update({
    where: { id: threadId },
    data: {
      outcome: parsed.outcome,
      outcomeAt: new Date(),
      state: finalState,
      closedAt: new Date(),
    },
  });

  let featuresCreated = 0;
  let featuresLinked = 0;
  // Carry the surviving ideas into the Feature Library. Each is deduped, so
  // rolling up two threads that spawned the same idea lands on one row.
  for (const idea of parsed.ideas) {
    try {
      const { featureId, created } = await upsertFeatureFromIdea({
        title: idea.title,
        detail: idea.detail,
        tags: idea.tags,
        cluster: idea.cluster ?? thread.cluster?.name ?? null,
      });
      if (created) featuresCreated++;
      else featuresLinked++;

      // Point the thread's own IDEA entries at the feature they became, so the
      // Feature page can trace back to where the idea came from.
      const unpromoted = thread.entries.filter((e) => e.kind === "IDEA" && !e.featureId);
      if (unpromoted.length > 0) {
        await db.logEntry.updateMany({
          where: { id: { in: unpromoted.map((e) => e.id) }, featureId: null },
          data: { featureId, promotedAt: new Date() },
        });
      }
    } catch (err) {
      console.warn("[rollup] idea promotion failed:", err);
    }
  }

  // Re-embed with the outcome included — "did we try this?" should hit the
  // thread whose outcome says we did.
  try {
    await embedThread(
      threadId,
      thread.title,
      thread.decision ?? "",
      `${thread.why ?? ""}\n\n${parsed.outcome}`,
    );
  } catch (err) {
    console.warn("[rollup] embedThread failed:", err);
  }

  return { outcome: parsed.outcome, featuresCreated, featuresLinked };
}
