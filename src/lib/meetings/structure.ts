import type { IntakeKind, Prisma } from "@prisma/client";

import { embedMeeting } from "@/lib/ai/embed-entities";
import { extractBrief, type ExtractedBrief } from "@/lib/ai/extract-brief";
import { findNearest } from "@/lib/ai/intake";
import { db } from "@/lib/db";

// Meeting → proposals.
//
// The transcript is read once and everything the model finds — decisions,
// feature ideas, action items, open questions — lands as IntakeProposal rows
// hanging off the meeting. Nothing else is written: no Feature in the library,
// no ActionItem on the meeting, until a person accepts the card. That is the
// same safety model as the /chat intake desk, reusing the same rows, the same
// card and the same accept path (src/lib/intake/accept.ts).
//
// The TL;DR is the one exception — it is a summary of the meeting itself, not
// a record elsewhere, so it is stored straight on the row.
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
}

interface Draft {
  kind: IntakeKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
}

function key(kind: string, title: string): string {
  return `${kind}:${title.trim().toLowerCase()}`;
}

export async function proposeBrief(meetingId: string): Promise<ProposeResult> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, transcript: true },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const brief = await extractBrief(meeting.transcript);
  return applyBrief(meeting, brief);
}

/**
 * The write half, split from the model call so it can be exercised without
 * OpenAI: given an extracted brief, replace the meeting's outstanding
 * proposals and store the TL;DR.
 */
export async function applyBrief(
  meeting: { id: string; title: string; transcript: string },
  brief: ExtractedBrief,
): Promise<ProposeResult> {
  const meetingId = meeting.id;

  const drafts: Draft[] = [
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
  // never holds a write lock. Matching is best-effort inside findNearest.
  const matched = [];
  for (const draft of fresh) {
    const match = await findNearest(draft.kind, `${draft.title}\n\n${draft.body ?? ""}`);
    matched.push({ draft, match });
  }

  await db.$transaction([
    // Outstanding cards are replaced wholesale; accepted and dismissed ones stay.
    db.intakeProposal.deleteMany({ where: { meetingId, status: "PROPOSED" } }),
    db.meeting.update({
      where: { id: meetingId },
      data: { tldr: brief.tldr, structuredAt: new Date() },
    }),
    ...matched.map(({ draft, match }, order) =>
      db.intakeProposal.create({
        data: {
          meetingId,
          kind: draft.kind,
          order,
          title: draft.title.slice(0, 300),
          body: draft.body,
          payload: draft.payload as Prisma.InputJsonValue,
          matchType: match?.type ?? null,
          matchId: match?.id ?? null,
          matchTitle: match?.title ?? null,
          matchScore: match?.score ?? null,
        },
      }),
    ),
  ]);

  // Semantic recall of the meeting itself is harmless and useful, so it is
  // not gated on acceptance. Best-effort: the embed sweep catches a miss.
  try {
    await embedMeeting(meetingId, meeting.title, brief.tldr, meeting.transcript);
  } catch (err) {
    console.warn("[proposeBrief] embedMeeting failed:", err);
  }

  return {
    tldr: brief.tldr,
    proposed: matched.length,
    skipped: drafts.length - fresh.length,
  };
}
