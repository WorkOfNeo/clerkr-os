import { db } from "@/lib/db";

// One click from the meeting page removes the meeting AND what it put into the
// rest of the system: features it added to the library and tickets raised from
// its action items. The child rows (decisions, signals, action items, open
// questions, proposals, attachments) already cascade in the schema.
//
// What counts as "the meeting's" feature is deliberately conservative — a
// feature that another meeting also points at, that has kanban cards, or that
// this meeting merely LINKED to (rather than created) is someone else's work
// and stays. Both entry points (server action and MCP tool) go through here.

export interface MeetingFootprint {
  features: { id: string; slug: string; title: string }[];
  tickets: { id: string; number: number; slug: string; title: string }[];
  decisions: number;
  actionItems: number;
  openQuestions: number;
  pendingProposals: number;
}

export async function meetingFootprint(meetingId: string): Promise<MeetingFootprint> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      proposals: {
        select: { status: true, createdType: true, createdId: true },
      },
      featureSignals: { select: { featureId: true } },
      actionItems: { select: { ticketId: true } },
      _count: { select: { decisions: true, actionItems: true, openQuestions: true } },
    },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const createdHere = new Set<string>();
  const linkedOnly = new Set<string>();
  for (const p of meeting.proposals) {
    if (p.status !== "ACCEPTED" || !p.createdId) continue;
    if (p.createdType === "feature") createdHere.add(p.createdId);
    if (p.createdType === "feature_link") linkedOnly.add(p.createdId);
  }

  // Signals from before the proposal flow have no proposal row, so a feature
  // they point at is judged by whether anything ELSE depends on it.
  const candidateIds = new Set<string>(createdHere);
  for (const s of meeting.featureSignals) {
    if (s.featureId && !linkedOnly.has(s.featureId)) candidateIds.add(s.featureId);
  }

  const features = candidateIds.size
    ? await db.feature.findMany({
        where: {
          id: { in: [...candidateIds] },
          signals: { none: { meetingId: { not: meetingId } } },
          kanbanCards: { none: {} },
        },
        select: { id: true, slug: true, title: true },
      })
    : [];

  const ticketIds = meeting.actionItems
    .map((a) => a.ticketId)
    .filter((id): id is string => Boolean(id));
  const tickets = ticketIds.length
    ? await db.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, number: true, slug: true, title: true },
      })
    : [];

  return {
    features,
    tickets,
    decisions: meeting._count.decisions,
    actionItems: meeting._count.actionItems,
    openQuestions: meeting._count.openQuestions,
    pendingProposals: meeting.proposals.filter((p) => p.status === "PROPOSED").length,
  };
}

export async function deleteMeetingCascade(
  meetingId: string,
): Promise<{ features: number; tickets: number }> {
  const footprint = await meetingFootprint(meetingId);
  const featureIds = footprint.features.map((f) => f.id);
  const ticketIds = footprint.tickets.map((t) => t.id);

  await db.$transaction([
    // Same unhooking deleteTicket does — a chat session pinned to the ticket
    // must not block the delete.
    db.chatSession.updateMany({ where: { ticketId: { in: ticketIds } }, data: { ticketId: null } }),
    db.actionItem.updateMany({ where: { ticketId: { in: ticketIds } }, data: { ticketId: null } }),
    db.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
    db.feature.deleteMany({ where: { id: { in: featureIds } } }),
    db.meeting.delete({ where: { id: meetingId } }),
  ]);

  return { features: featureIds.length, tickets: ticketIds.length };
}
