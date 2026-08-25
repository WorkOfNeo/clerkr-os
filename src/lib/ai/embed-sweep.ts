import { db } from "@/lib/db";

import { embedFeature, embedLogEntry, embedMeeting, embedThread } from "./embed-entities";
import { embedNote } from "./embed-wiki";
import { isOpenAIAvailable } from "./openai";

// Safety net for the "everything must be searchable" guarantee: finds rows
// whose embedding is NULL (created while OpenAI was down/unconfigured, bulk
// backfills, or transient embed failures) and embeds them. Runs on a timer
// from src/instrumentation.ts and on demand via the backfill_embeddings MCP
// tool. Individual failures are counted, never thrown — the next pass retries.

export interface SweepResult {
  skipped: boolean; // true when OpenAI is not configured
  embedded: { wikiNotes: number; features: number; meetings: number; threads: number; logEntries: number };
  errors: number;
  remaining: { wikiNotes: number; features: number; meetings: number; threads: number; logEntries: number };
}

type EmbeddedTable = "wiki_note" | "feature" | "meeting" | "thread" | "log_entry";

async function remainingCount(table: EmbeddedTable): Promise<number> {
  // Table name comes from a closed union above — safe to inline.
  const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM ${table} WHERE embedding IS NULL`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function sweepMissingEmbeddings(limitPerKind = 25): Promise<SweepResult> {
  const embedded = { wikiNotes: 0, features: 0, meetings: 0, threads: 0, logEntries: 0 };
  let errors = 0;

  if (!isOpenAIAvailable()) {
    return {
      skipped: true,
      embedded,
      errors,
      remaining: await remainingCounts(),
    };
  }

  const notes = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM wiki_note WHERE embedding IS NULL LIMIT ${limitPerKind}`;
  for (const { id } of notes) {
    try {
      const n = await db.wikiNote.findUnique({
        where: { id },
        select: { title: true, body: true },
      });
      if (!n) continue;
      await embedNote(id, n.title, n.body);
      embedded.wikiNotes++;
    } catch (err) {
      errors++;
      console.warn(`[embed-sweep] wiki_note ${id} failed:`, err);
    }
  }

  const features = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM feature WHERE embedding IS NULL LIMIT ${limitPerKind}`;
  for (const { id } of features) {
    try {
      const f = await db.feature.findUnique({
        where: { id },
        select: { title: true, description: true },
      });
      if (!f) continue;
      await embedFeature(id, f.title, f.description ?? "");
      embedded.features++;
    } catch (err) {
      errors++;
      console.warn(`[embed-sweep] feature ${id} failed:`, err);
    }
  }

  const meetings = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM meeting WHERE embedding IS NULL LIMIT ${limitPerKind}`;
  for (const { id } of meetings) {
    try {
      const m = await db.meeting.findUnique({
        where: { id },
        select: { title: true, tldr: true, transcript: true },
      });
      if (!m) continue;
      await embedMeeting(id, m.title, m.tldr ?? "", m.transcript);
      embedded.meetings++;
    } catch (err) {
      errors++;
      console.warn(`[embed-sweep] meeting ${id} failed:`, err);
    }
  }

  const threads = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM thread WHERE embedding IS NULL LIMIT ${limitPerKind}`;
  for (const { id } of threads) {
    try {
      const t = await db.thread.findUnique({
        where: { id },
        select: { title: true, decision: true, why: true, outcome: true },
      });
      if (!t) continue;
      await embedThread(
        id,
        t.title,
        t.decision ?? "",
        [t.why, t.outcome].filter(Boolean).join("\n\n"),
      );
      embedded.threads++;
    } catch (err) {
      errors++;
      console.warn(`[embed-sweep] thread ${id} failed:`, err);
    }
  }

  const entries = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM log_entry WHERE embedding IS NULL LIMIT ${limitPerKind}`;
  for (const { id } of entries) {
    try {
      const e = await db.logEntry.findUnique({ where: { id }, select: { body: true } });
      if (!e) continue;
      await embedLogEntry(id, e.body);
      embedded.logEntries++;
    } catch (err) {
      errors++;
      console.warn(`[embed-sweep] log_entry ${id} failed:`, err);
    }
  }

  return { skipped: false, embedded, errors, remaining: await remainingCounts() };
}

async function remainingCounts(): Promise<SweepResult["remaining"]> {
  return {
    wikiNotes: await remainingCount("wiki_note"),
    features: await remainingCount("feature"),
    meetings: await remainingCount("meeting"),
    threads: await remainingCount("thread"),
    logEntries: await remainingCount("log_entry"),
  };
}
