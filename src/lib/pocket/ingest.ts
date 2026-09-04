import { Prisma, type MeetingKind } from "@prisma/client";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { proposeBrief } from "@/lib/meetings/structure";
import { slugify, uniqueSlug } from "@/lib/slug";

import { meetingFieldsFrom, type PocketWebhookPayload } from "./payload";

// Turning a Pocket delivery into a Meeting row, and nothing else.
//
// What this deliberately does NOT do is create decisions, features, tickets or
// action items. A recording that ends on your desk becomes a meeting plus a
// set of IntakeProposal cards you accept — the same path as a pasted
// transcript, through the same proposeBrief and the same accept action. An
// integration that files records while you are still walking out of the room
// is exactly the failure mode /meetings was rebuilt to remove.

export interface IngestConnection {
  id: string;
  userId: string;
  defaultKind: MeetingKind;
}

export type IngestResult =
  | { status: "created"; meetingId: string; slug: string }
  | { status: "updated"; meetingId: string; slug: string }
  | { status: "skipped"; reason: "empty" | "unknown-recording" };

/**
 * Upsert the meeting for a recording.
 *
 * `mode: "refresh"` will only ever update an existing meeting — a delivery
 * that just relabels speakers must not conjure a meeting we chose not to file.
 */
export async function ingestPocketRecording(input: {
  connection: IngestConnection;
  payload: PocketWebhookPayload;
  mode: "ingest" | "refresh";
}): Promise<IngestResult> {
  const { connection, payload, mode } = input;
  const pocketRecordingId = payload.recording.id;

  const existing = await db.meeting.findUnique({
    where: { pocketRecordingId },
    select: { id: true, slug: true },
  });

  if (!existing && mode === "refresh") {
    return { status: "skipped", reason: "unknown-recording" };
  }

  const fields = meetingFieldsFrom(payload);
  if (!fields.hasContent) return { status: "skipped", reason: "empty" };

  if (existing) {
    // The slug is left alone on purpose: it is in links people have already
    // followed, and Pocket re-titling a recording is not worth breaking them.
    await db.meeting.update({
      where: { id: existing.id },
      data: {
        title: fields.title,
        meetingDate: fields.meetingDate,
        attendees: fields.attendees,
        transcript: fields.body,
      },
    });
    return { status: "updated", meetingId: existing.id, slug: existing.slug };
  }

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
        transcript: fields.body,
        authorId: connection.userId,
        pocketRecordingId,
      },
      select: { id: true, slug: true },
    });
    return { status: "created", meetingId: meeting.id, slug: meeting.slug };
  } catch (err) {
    // Two deliveries for one recording can race past the findUnique above.
    // The unique constraint is what makes that safe; this turns the loser of
    // the race into the update it should have been.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await db.meeting.findUnique({
        where: { pocketRecordingId },
        select: { id: true, slug: true },
      });
      if (raced) return { status: "updated", meetingId: raced.id, slug: raced.slug };
    }
    throw err;
  }
}

/**
 * Read a freshly-arrived meeting and tell its owner what is waiting.
 *
 * Runs AFTER the webhook response, via `after()` in the route: Pocket gives a
 * delivery 30 seconds and extract-plus-review does not reliably fit, and a
 * timeout there means a retry that duplicates the work rather than a nicer
 * error. Best-effort throughout — a meeting that fails to read is still a
 * meeting, with the "Propose again" button on its page.
 */
export async function readPocketMeeting(input: {
  meetingId: string;
  userId: string;
}): Promise<void> {
  const { meetingId, userId } = input;
  if (!isOpenAIAvailable()) return;

  let proposed = 0;
  try {
    const result = await proposeBrief(meetingId);
    proposed = result.proposed;
  } catch (err) {
    console.warn("[pocket] proposeBrief failed:", err);
    return;
  }

  try {
    await notifyMeetingLanded({ meetingId, userId, proposed });
  } catch (err) {
    console.warn("[pocket] notify failed:", err);
  }
}

async function notifyMeetingLanded(input: {
  meetingId: string;
  userId: string;
  proposed: number;
}): Promise<void> {
  const { meetingId, userId, proposed } = input;

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { title: true, tldr: true },
  });
  if (!meeting) return;

  // Keyed on the meeting, not on the moment — a re-read after an edit must not
  // ring the bell a second time for the same recording.
  const dedupeKey = `pocket-meeting:${meetingId}`;
  const { count } = await db.notification.createMany({
    data: [
      {
        userId,
        kind: "PROPOSALS_WAITING",
        title:
          proposed > 0
            ? `${meeting.title} — ${proposed} card${proposed === 1 ? "" : "s"} to review`
            : `${meeting.title} landed from Pocket`,
        body: meeting.tldr ?? undefined,
        href: `/meetings/${meetingId}`,
        dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return;

  const fresh = await db.notification.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (!fresh) return;

  const { pushUnsent } = await import("@/lib/notifications/push");
  await pushUnsent([fresh.id]);
}
