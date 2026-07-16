import { enrichMeeting, type EnrichSignal } from "@/lib/ai/enrich-meeting";
import { extractBrief } from "@/lib/ai/extract-brief";
import { db } from "@/lib/db";

// Shared brief-extraction pipeline: extract → replace child rows → create
// signals → enrich (embed + cluster + dedupe + promote). Called from both the
// /meetings server action and the MCP meeting tools so the two entry points
// can never drift.

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface StructureResult {
  tldr: string;
  decisions: number;
  featureSignals: number;
  actionItems: number;
  openQuestions: number;
}

export async function runStructurePipeline(meetingId: string): Promise<StructureResult> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, transcript: true },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const brief = await extractBrief(meeting.transcript);

  // Re-runnable: clear the prior extraction (our own child rows — safe to
  // delete) and re-create everything except signals in one transaction.
  await db.$transaction([
    db.decision.deleteMany({ where: { meetingId } }),
    db.featureSignal.deleteMany({ where: { meetingId } }),
    db.actionItem.deleteMany({ where: { meetingId } }),
    db.openQuestion.deleteMany({ where: { meetingId } }),
    db.meeting.update({
      where: { id: meetingId },
      data: {
        tldr: brief.tldr,
        structuredAt: new Date(),
        decisions: {
          create: brief.decisions.map((d) => ({
            content: d.content,
            owner: d.owner ?? null,
          })),
        },
        actionItems: {
          create: brief.actionItems.map((a) => ({
            content: a.content,
            assignee: a.assignee ?? null,
            dueDate: parseDate(a.dueDate),
          })),
        },
        openQuestions: {
          create: brief.openQuestions.map((q) => ({ content: q.content })),
        },
      },
    }),
  ]);

  // Feature signals are created individually so we can capture their ids and
  // cluster hints for the enrichment pass (embed + cluster + dedupe + promote).
  const enrichSignals: EnrichSignal[] = [];
  for (const f of brief.featureSignals) {
    const sig = await db.featureSignal.create({
      data: {
        meetingId,
        title: f.title,
        detail: f.detail ?? null,
        status: f.status,
        tags: f.tags,
      },
      select: { id: true },
    });
    enrichSignals.push({
      id: sig.id,
      title: f.title,
      detail: f.detail ?? null,
      status: f.status,
      tags: f.tags,
      cluster: f.cluster ?? null,
    });
  }

  // Embed the meeting and auto-cluster / categorize / dedupe / promote signals.
  // Best-effort — never fail the structuring if enrichment hiccups.
  try {
    await enrichMeeting(meetingId, enrichSignals);
  } catch (err) {
    console.warn("[runStructurePipeline] enrichment failed:", err);
  }

  return {
    tldr: brief.tldr,
    decisions: brief.decisions.length,
    featureSignals: brief.featureSignals.length,
    actionItems: brief.actionItems.length,
    openQuestions: brief.openQuestions.length,
  };
}
