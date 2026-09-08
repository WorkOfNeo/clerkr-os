import { Prisma, type MeetingKind } from "@prisma/client";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { proposeBrief } from "@/lib/meetings/structure";
import { slugify, uniqueSlug } from "@/lib/slug";

import { getRecording, listRecordings, PocketApiError, type PocketRecording } from "./client";
import { meetingFieldsFromRecording } from "./payload";

// Pulling recordings from Pocket into meetings.
//
// The shape of this is the privacy model, not an implementation detail:
//
//   1. LIST, filtered by tag at Pocket's end. The list carries no transcript
//      and no summary, and an untagged recording is never even returned. A
//      conversation with another client therefore never reaches this server.
//   2. Skip anything already imported, by `Meeting.pocketRecordingId`.
//   3. Only then FETCH THE FULL TEXT, one recording at a time, for the ones
//      that are actually being filed.
//
// A webhook cannot do (1) — it pushes everything and lets the receiver sort it
// out, by which point the other client's meeting is already here.
//
// What it does NOT do is create decisions, features, tickets or action items.
// A recording becomes a meeting plus IntakeProposal cards a person accepts,
// through the same proposeBrief as a pasted transcript.

/** How far back a first-ever sync looks. Pocket filters on whole UTC days. */
const FIRST_RUN_DAYS = 7;
/** Ceiling per run, so a long backlog can't melt one poll. */
const MAX_PER_RUN = 10;

export interface SyncResult {
  connectionId: string;
  label: string;
  /** Recordings the tag filter returned. */
  seen: number;
  /** Meetings created this run. */
  imported: number;
  /** Already had a meeting. */
  skipped: number;
  error?: string;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ConnectionRow = {
  id: string;
  label: string;
  userId: string;
  apiKey: string;
  tagIds: string[];
  defaultKind: MeetingKind;
  lastSyncAt: Date | null;
};

/**
 * Import one recording we have already decided belongs here. Fetches the full
 * text — the only call that moves content off Pocket.
 */
export async function importRecording(input: {
  connection: { id: string; userId: string; defaultKind: MeetingKind; apiKey: string };
  recordingId: string;
  /** Skip the fetch when the caller already holds a detailed recording. */
  prefetched?: PocketRecording;
}): Promise<{ status: "created" | "exists" | "empty"; meetingId?: string }> {
  const { connection, recordingId } = input;

  const existing = await db.meeting.findUnique({
    where: { pocketRecordingId: recordingId },
    select: { id: true },
  });
  if (existing) return { status: "exists", meetingId: existing.id };

  const rec = input.prefetched ?? (await getRecording(connection.apiKey, recordingId));
  if (!rec) return { status: "empty" };

  const fields = meetingFieldsFromRecording(rec);
  if (!fields.hasContent) return { status: "empty" };


  const slug = await uniqueSlug(slugify(fields.title), async (candidate) =>
    Boolean(await db.meeting.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );

  try {
    const meeting = await db.meeting.create({
      data: {
        slug,
        title: fields.title,
        kind: connection.defaultKind,
        meetingDate: fields.meetingDate,
        attendees: fields.attendees,
        transcript: fields.transcript,
        summary: fields.summary,
        authorId: connection.userId,
        pocketRecordingId: recordingId,
      },
      select: { id: true },
    });
    return { status: "created", meetingId: meeting.id };
  } catch (err) {
    // Two runs can race past the findUnique above; the unique constraint is
    // what makes that safe.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await db.meeting.findUnique({
        where: { pocketRecordingId: recordingId },
        select: { id: true },
      });
      if (raced) return { status: "exists", meetingId: raced.id };
    }
    throw err;
  }
}

/**
 * Re-fetch a meeting already imported, and overwrite its summary and
 * transcript with what Pocket holds now.
 *
 * This exists because the first version of the parser read the documented
 * transcript shape rather than the real one and stored no transcript at all.
 * It is equally the fix for a recording re-summarised or re-labelled in Pocket
 * afterwards. The slug is left alone — it is in links people have followed.
 */
export async function refetchMeeting(meetingId: string): Promise<
  { status: "updated"; transcriptChars: number } | { status: "not-pocket" | "gone" | "empty" }
> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, pocketRecordingId: true },
  });
  if (!meeting?.pocketRecordingId) return { status: "not-pocket" };

  const connection = await db.pocketConnection.findFirst({
    where: { active: true },
    select: { apiKey: true },
  });
  if (!connection) return { status: "gone" };

  const rec = await getRecording(connection.apiKey, meeting.pocketRecordingId);
  if (!rec) return { status: "gone" };

  const fields = meetingFieldsFromRecording(rec);
  if (!fields.hasContent) return { status: "empty" };

  await db.meeting.update({
    where: { id: meetingId },
    data: {
      title: fields.title,
      meetingDate: fields.meetingDate,
      attendees: fields.attendees,
      transcript: fields.transcript,
      summary: fields.summary,
    },
  });
  return { status: "updated", transcriptChars: fields.transcript.length };
}

/** Read a freshly-imported meeting. Best-effort — a failure leaves the button. */
export async function readImportedMeeting(meetingId: string): Promise<void> {
  if (!isOpenAIAvailable()) return;
  try {
    await proposeBrief(meetingId);
  } catch (err) {
    console.warn("[pocket] proposeBrief failed:", err);
  }
}

async function syncConnection(conn: ConnectionRow): Promise<SyncResult> {
  const base: SyncResult = { connectionId: conn.id, label: conn.label, seen: 0, imported: 0, skipped: 0 };

  // No tags means nothing syncs. That is the safe default, not an oversight —
  // an empty filter would ask Pocket for every recording this person has made.
  if (conn.tagIds.length === 0) {
    return { ...base, error: "No tags selected, so nothing is synced." };
  }

  const since = conn.lastSyncAt ?? new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000);

  let recordings: PocketRecording[];
  try {
    recordings = await listRecordings(conn.apiKey, {
      tagIds: conn.tagIds,
      startDate: dayKey(since),
      limit: 50,
    });
  } catch (err) {
    return {
      ...base,
      error: err instanceof PocketApiError ? err.message : String(err),
    };
  }

  base.seen = recordings.length;

  const ids = recordings.map((r) => r.id);
  const already = await db.meeting.findMany({
    where: { pocketRecordingId: { in: ids } },
    select: { pocketRecordingId: true },
  });
  const have = new Set(already.map((m) => m.pocketRecordingId));
  const fresh = recordings.filter((r) => !have.has(r.id)).slice(0, MAX_PER_RUN);
  base.skipped = recordings.length - fresh.length;

  const readAfter: string[] = [];
  for (const rec of fresh) {
    try {
      const result = await importRecording({ connection: conn, recordingId: rec.id });
      if (result.status === "created" && result.meetingId) {
        base.imported++;
        readAfter.push(result.meetingId);
      }
    } catch (err) {
      console.warn(`[pocket] import ${rec.id} failed:`, err);
      base.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Only move the watermark when the list call itself succeeded, so a failed
  // poll re-examines the same window rather than skipping over it.
  await db.pocketConnection.update({
    where: { id: conn.id },
    data: {
      lastSyncAt: new Date(),
      lastEventAt: new Date(),
      lastEvent: `synced ${base.imported} of ${base.seen}`,
      lastError: base.error ?? null,
      lastSeen: base.seen,
      deliveries: { increment: 1 },
      meetingsCreated: { increment: base.imported },
    },
  });

  for (const meetingId of readAfter) await readImportedMeeting(meetingId);

  return base;
}

/** Poll every active connection. Runs on a timer from src/instrumentation.ts. */
export async function syncPocket(): Promise<SyncResult[]> {
  const connections = await db.pocketConnection.findMany({
    where: { active: true },
    select: {
      id: true,
      label: true,
      userId: true,
      apiKey: true,
      tagIds: true,
      defaultKind: true,
      lastSyncAt: true,
    },
  });

  const results: SyncResult[] = [];
  for (const conn of connections) {
    try {
      results.push(await syncConnection(conn));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[pocket] sync ${conn.label} failed:`, err);
      results.push({
        connectionId: conn.id,
        label: conn.label,
        seen: 0,
        imported: 0,
        skipped: 0,
        error: message,
      });
      await db.pocketConnection
        .update({ where: { id: conn.id }, data: { lastError: message, lastEventAt: new Date() } })
        .catch(() => {});
    }
  }
  return results;
}
