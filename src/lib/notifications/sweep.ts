import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Works out what is worth telling someone, and writes one row per fact.
 *
 * Runs on a timer, so the whole thing rests on `dedupeKey` being stable for a
 * real-world fact rather than for a moment in time: "this card is due on this
 * date", not "the sweep noticed something". `createMany({ skipDuplicates })`
 * against a UNIQUE column then makes re-running free, and nobody is told the
 * same thing twice. A bell that cries wolf is worse than no bell.
 */

/** A ticket nobody has touched for this long is probably forgotten. */
const STALE_TICKET_DAYS = 10;
/** Proposals left unconfirmed this long were probably missed, not rejected. */
const PROPOSAL_STALE_HOURS = 20;

export interface SweepResult {
  created: number;
  byKind: Record<string, number>;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function sweepNotifications(): Promise<SweepResult> {
  const now = new Date();
  const rows: Prisma.NotificationCreateManyInput[] = [];

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  // ── Cards due today, and cards already past due ───────────────────────────
  const dueCards = await db.kanbanCard.findMany({
    where: { dueDate: { not: null, lte: endOfToday }, completedAt: null },
    select: { id: true, number: true, title: true, dueDate: true },
    take: 50,
  });

  for (const card of dueCards) {
    const due = card.dueDate!;
    const overdue = due < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rows.push({
      kind: overdue ? "CARD_OVERDUE" : "CARD_DUE",
      title: overdue ? `Overdue: ${card.title}` : `Due today: ${card.title}`,
      body: overdue ? `Was due ${dayKey(due)}.` : undefined,
      href: "/kanban",
      // Re-keyed per day for overdue, so one forgotten card nags once a day
      // rather than once every sweep — or once ever and then never again.
      dedupeKey: overdue
        ? `card-overdue:${card.id}:${dayKey(now)}`
        : `card-due:${card.id}:${dayKey(due)}`,
    });
  }

  // ── Tickets filed by Claude while nobody was watching ─────────────────────
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const filed = await db.ticket.findMany({
    where: { source: "MCP", createdAt: { gte: since } },
    select: { id: true, number: true, title: true, slug: true },
    take: 25,
  });
  for (const t of filed) {
    rows.push({
      kind: "TICKET_FILED",
      title: `Claude filed #${t.number}`,
      body: t.title,
      href: `/tickets/${t.slug}`,
      dedupeKey: `ticket-filed:${t.id}`,
    });
  }

  // ── Intake proposals still sitting unconfirmed ────────────────────────────
  const staleProposalCutoff = new Date(now.getTime() - PROPOSAL_STALE_HOURS * 60 * 60 * 1000);
  const waiting = await db.intakeProposal.count({
    where: { status: "PROPOSED", createdAt: { lte: staleProposalCutoff } },
  });
  if (waiting > 0) {
    rows.push({
      kind: "PROPOSALS_WAITING",
      title: `${waiting} proposal${waiting === 1 ? "" : "s"} waiting`,
      body: "Filed nothing yet — confirm or dismiss them.",
      href: "/chat",
      // Once a day: this is a nudge, not an alarm.
      dedupeKey: `proposals-waiting:${dayKey(now)}`,
    });
  }

  // ── Tickets going stale ───────────────────────────────────────────────────
  const staleCutoff = new Date(now.getTime() - STALE_TICKET_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.ticket.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, updatedAt: { lte: staleCutoff } },
    orderBy: { updatedAt: "asc" },
    select: { id: true, number: true, title: true, slug: true },
    take: 5,
  });
  for (const t of stale) {
    rows.push({
      kind: "TICKET_STALE",
      title: `#${t.number} has gone quiet`,
      body: `${t.title} — untouched for ${STALE_TICKET_DAYS}+ days.`,
      href: `/tickets/${t.slug}`,
      // Weekly, so a deliberately-parked ticket doesn't nag every day.
      dedupeKey: `ticket-stale:${t.id}:${weekKey(now)}`,
    });
  }

  if (rows.length === 0) return { created: 0, byKind: {} };

  const { count } = await db.notification.createMany({ data: rows, skipDuplicates: true });

  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return { created: count, byKind };
}

function weekKey(d: Date): string {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().slice(0, 10);
}

/** Delete read notifications older than a month — the bell is a to-do list,
 *  not an archive. */
export async function pruneNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await db.notification.deleteMany({
    where: { readAt: { not: null }, createdAt: { lte: cutoff } },
  });
  return count;
}
