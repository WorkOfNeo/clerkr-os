import type { LogKind, LogSource, Prisma, ThreadState } from "@prisma/client";

import { embedLogEntry, embedThread } from "@/lib/ai/embed-entities";
import { ensureCluster } from "@/lib/clusters";
import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

// The single write path for the work log. Server actions, MCP tools and the
// session-end ingest all funnel through here so slugging, embedding and
// provenance behave identically no matter who is writing.
//
// Embedding is best-effort on every write: a failure is logged and left for
// the sweep in src/lib/ai/embed-sweep.ts. Losing a vector must never lose the
// entry — the entry is the thing you can't reconstruct.

export interface CreateThreadInput {
  title: string;
  decision?: string | null;
  why?: string | null;
  cluster?: string | null;
  featureId?: string | null;
  state?: ThreadState;
  authorId: string;
}

export async function createThread(input: CreateThreadInput) {
  const slug = await uniqueSlug(slugify(input.title), async (c) =>
    Boolean(await db.thread.findUnique({ where: { slug: c }, select: { id: true } })),
  );
  const clusterId = input.cluster ? await ensureCluster(input.cluster) : null;

  const thread = await db.thread.create({
    data: {
      slug,
      title: input.title.trim(),
      decision: input.decision?.trim() || null,
      why: input.why?.trim() || null,
      state: input.state ?? "OPEN",
      clusterId,
      featureId: input.featureId ?? null,
      authorId: input.authorId,
    },
  });

  await tryEmbedThread(thread.id, thread.title, thread.decision, thread.why);
  return thread;
}

export async function tryEmbedThread(
  id: string,
  title: string,
  decision: string | null,
  why: string | null,
): Promise<void> {
  try {
    await embedThread(id, title, decision ?? "", why ?? "");
  } catch (err) {
    console.warn("[log] embedThread failed:", err);
  }
}

export interface WriteEntryInput {
  body: string;
  kind?: LogKind;
  threadId?: string | null;
  source?: LogSource;
  sessionId?: string | null;
  repo?: string | null;
  branch?: string | null;
  reviewed?: boolean;
  occurredAt?: Date;
  authorId: string;
}

export async function writeLogEntry(input: WriteEntryInput) {
  const entry = await db.logEntry.create({
    data: {
      body: input.body.trim(),
      kind: input.kind ?? "NOTE",
      threadId: input.threadId ?? null,
      source: input.source ?? "MANUAL",
      sessionId: input.sessionId ?? null,
      repo: input.repo ?? null,
      branch: input.branch ?? null,
      // Anything a human typed is reviewed on arrival; AI-written entries
      // default to unreviewed and surface in the /log review tray.
      reviewed: input.reviewed ?? (input.source ?? "MANUAL") === "MANUAL",
      occurredAt: input.occurredAt ?? new Date(),
      authorId: input.authorId,
    },
  });

  try {
    await embedLogEntry(entry.id, entry.body);
  } catch (err) {
    console.warn("[log] embedLogEntry failed:", err);
  }

  // Touch the thread so /threads sorts by real activity, not creation date.
  if (entry.threadId) {
    await db.thread.update({
      where: { id: entry.threadId },
      data: { updatedAt: new Date() },
    });
  }
  return entry;
}

/** Resolve a thread by id or slug — MCP callers use whichever they have. */
export async function resolveThread(ref: string) {
  const thread = await db.thread.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, slug: true, title: true, state: true },
  });
  if (!thread) throw new Error(`Thread not found: ${ref}`);
  return thread;
}

export const threadListSelect = {
  id: true,
  slug: true,
  title: true,
  decision: true,
  state: true,
  startedAt: true,
  closedAt: true,
  updatedAt: true,
  cluster: { select: { name: true, slug: true } },
  feature: { select: { slug: true, title: true } },
  _count: { select: { entries: true } },
} satisfies Prisma.ThreadSelect;

export const entrySelect = {
  id: true,
  kind: true,
  body: true,
  source: true,
  reviewed: true,
  sessionId: true,
  repo: true,
  branch: true,
  occurredAt: true,
  promotedAt: true,
  thread: { select: { id: true, slug: true, title: true, state: true } },
  feature: { select: { slug: true, title: true } },
} satisfies Prisma.LogEntrySelect;
