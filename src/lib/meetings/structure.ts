import type { Prisma } from "@prisma/client";

import { embedMeeting } from "@/lib/ai/embed-entities";
import { extractBrief, type ExtractedBrief } from "@/lib/ai/extract-brief";
import { findNearest } from "@/lib/ai/intake";
import { db } from "@/lib/db";

import { reviewDrafts, unreviewedTrace, type Draft, type ReasoningTrace } from "./review";

// Meeting → proposals.
//
// Three steps: extract a brief from the transcript (structured JSON, using the
// editable meeting prompt), have the reviewer agent check it against what
// exists and explain each item (src/lib/meetings/review.ts), then persist the
// result as IntakeProposal rows hanging off the meeting. Nothing else is
// written: no Feature in the library, no ActionItem on the meeting, until a
// person accepts the card. That is the same safety model as the /chat intake
// desk, reusing the same rows, the same card and the same accept path
// (src/lib/intake/accept.ts).
//
// The TL;DR and the reasoning trace are the exceptions — they describe the
// meeting and the read itself, not records elsewhere, so they live on the row.
//
// Called from the /meetings server actions and the MCP meeting tools so the
// two entry points can never drift.

const SIGNAL_TO_FEATURE_STATUS = {
  NEW: "IDEA",
  ALREADY_TRACKED: "VALIDATED",
  SMALL_UNIQUE: "SMALL_UNIQUE",
} as const;

export interface ProposeResult {
  tldr: string;
  /** Cards now waiting on the meeting page. */
  proposed: number;
  /** Items the model found again that had already been accepted or dismissed. */
  skipped: number;
  /** Items the reviewer dropped as noise or duplicates. */
  dropped: number;
  /** Whether the reviewer agent ran to completion. */
  reviewed: boolean;
}

type MeetingRow = { id: string; title: string; transcript: string };

function key(kind: string, title: string): string {
  return `${kind}:${title.trim().toLowerCase()}`;
}

export function draftsFromBrief(brief: ExtractedBrief): Draft[] {
  return [
    ...brief.decisions.map<Draft>((d) => ({
      kind: "DECISION",
      title: d.content,
      body: null,
      payload: { owner: d.owner ?? null },
    })),
    ...brief.featureSignals.map<Draft>((f) => ({
      kind: "FEATURE",
      title: f.title,
      body: f.detail ?? null,
      payload: {
        signalStatus: f.status,
        status: SIGNAL_TO_FEATURE_STATUS[f.status],
        tags: f.tags,
        cluster: f.cluster ?? null,
      },
    })),
    ...brief.actionItems.map<Draft>((a) => ({
      kind: "ACTION_ITEM",
      title: a.content,
      body: null,
      payload: { assignee: a.assignee ?? null, dueDate: a.dueDate ?? null },
    })),
    ...brief.openQuestions.map<Draft>((q) => ({
      kind: "OPEN_QUESTION",
      title: q.content,
      body: null,
      payload: {},
    })),
  ];
}

export async function proposeBrief(meetingId: string): Promise<ProposeResult> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, transcript: true },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const brief = await extractBrief(meeting.transcript);
  const raw = draftsFromBrief(brief);

  // The reviewer is best-effort: a failure shows the raw extraction with a
  // trace that says so, rather than losing the brief.
  let drafts = raw;
  let trace: ReasoningTrace;
  try {
    const reviewed = await reviewDrafts(meeting, raw);
    drafts = reviewed.drafts;
    trace = reviewed.trace;
  } catch (err) {
    console.warn("[proposeBrief] review failed:", err);
    trace = unreviewedTrace(
      `The reviewer failed (${err instanceof Error ? err.message : String(err)}), so these are the raw extraction.`,
    );
  }

  return persistDrafts(meeting, brief.tldr, drafts, trace, raw.length - drafts.length);
}

/**
 * The write half without the model calls, so it can be exercised without
 * OpenAI: given an extracted brief, replace the meeting's outstanding
 * proposals and store the TL;DR.
 */
export async function applyBrief(
  meeting: MeetingRow,
  brief: ExtractedBrief,
  trace: ReasoningTrace = unreviewedTrace("Applied without the reviewer."),
): Promise<ProposeResult> {
  return persistDrafts(meeting, brief.tldr, draftsFromBrief(brief), trace, 0);
}

async function persistDrafts(
  meeting: MeetingRow,
  tldr: string,
  drafts: Draft[],
  trace: ReasoningTrace,
  dropped: number,
): Promise<ProposeResult> {
  const meetingId = meeting.id;

  // A re-run must not re-surface something a person already decided on. The
  // model tends to phrase the same item the same way twice, so an exact
  // (case-insensitive) title match per kind is enough to recognise it.
  const decided = await db.intakeProposal.findMany({
    where: { meetingId, status: { not: "PROPOSED" } },
    select: { kind: true, title: true },
  });
  const seen = new Set(decided.map((p) => key(p.kind, p.title)));
  const fresh = drafts.filter((d) => !seen.has(key(d.kind, d.title)));

  // Match against what exists BEFORE the transaction so a slow embedding call
  // never holds a write lock. Matching is best-effort inside findNearest, and
  // a record the reviewer pointed at wins over the nearest-neighbour guess.
  const matched = [];
  for (const draft of fresh) {
    const nearest = draft.existing
      ? null
      : await findNearest(draft.kind, `${draft.title}\n\n${draft.body ?? ""}`);
    matched.push({ draft, nearest });
  }

  await db.$transaction([
    // Outstanding cards are replaced wholesale; accepted and dismissed ones stay.
    db.intakeProposal.deleteMany({ where: { meetingId, status: "PROPOSED" } }),
    db.meeting.update({
      where: { id: meetingId },
      data: {
        tldr,
        structuredAt: new Date(),
        reasoning: trace as unknown as Prisma.InputJsonValue,
      },
    }),
    ...matched.map(({ draft, nearest }, order) =>
      db.intakeProposal.create({
        data: {
          meetingId,
          kind: draft.kind,
          order,
          title: draft.title.slice(0, 300),
          body: draft.body,
          payload: draft.payload as Prisma.InputJsonValue,
          matchType: draft.existing?.type ?? nearest?.type ?? null,
          matchId: draft.existing?.id ?? nearest?.id ?? null,
          matchTitle: draft.existing?.title ?? nearest?.title ?? null,
          matchScore: draft.existing ? null : (nearest?.score ?? null),
        },
      }),
    ),
  ]);

  // Semantic recall of the meeting itself is harmless and useful, so it is
  // not gated on acceptance. Best-effort: the embed sweep catches a miss.
  try {
    await embedMeeting(meetingId, meeting.title, tldr, meeting.transcript);
  } catch (err) {
    console.warn("[proposeBrief] embedMeeting failed:", err);
  }

  return {
    tldr,
    proposed: matched.length,
    skipped: drafts.length - fresh.length,
    dropped,
    reviewed: trace.completed,
  };
}
