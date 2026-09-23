import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { subtaskSelect } from "@/lib/kanban";
import { ORDER_GAP, orderForSlot } from "@/lib/kanban-order";
import { ledgerMatchKey } from "@/lib/ledger";

/**
 * A card's checklist. One write path for the card panel, the card page and
 * MCP, same as the rest of lib/kanban — `doneAt` in particular is stamped here
 * and nowhere else.
 */

export type SubtaskRow = Prisma.KanbanSubtaskGetPayload<{ select: typeof subtaskSelect }>;

async function endOfChecklist(cardId: string): Promise<number> {
  const last = await db.kanbanSubtask.findFirst({
    where: { cardId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? 0) + ORDER_GAP;
}

export interface NewSubtask {
  title: string;
  done?: boolean;
  ledgerRef?: string | null;
}

/** Append lines to the end of a card's checklist, in the order given. */
export async function addSubtasks(cardId: string, items: NewSubtask[]): Promise<SubtaskRow[]> {
  const clean = items
    .map((i) => ({ ...i, title: i.title.trim() }))
    .filter((i) => i.title.length > 0);
  if (clean.length === 0) return [];

  const start = await endOfChecklist(cardId);
  const now = new Date();
  return db.$transaction(
    clean.map((item, i) =>
      db.kanbanSubtask.create({
        data: {
          cardId,
          title: item.title,
          done: item.done ?? false,
          doneAt: item.done ? now : null,
          order: start + i * ORDER_GAP,
          ledgerRef: item.ledgerRef?.trim() || null,
        },
        select: subtaskSelect,
      }),
    ),
  );
}

export interface SubtaskPatch {
  title?: string;
  done?: boolean;
  ledgerRef?: string | null;
  /** Explicit sparse order — from a drag, via orderForSlot. */
  order?: number;
}

export async function updateSubtask(id: string, patch: SubtaskPatch): Promise<SubtaskRow> {
  const data: Prisma.KanbanSubtaskUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("A subtask needs some words.");
    data.title = title;
  }
  if (patch.done !== undefined) {
    data.done = patch.done;
    data.doneAt = patch.done ? new Date() : null;
  }
  if (patch.ledgerRef !== undefined) data.ledgerRef = patch.ledgerRef?.trim() || null;
  if (patch.order !== undefined) data.order = patch.order;

  return db.kanbanSubtask.update({ where: { id }, data, select: subtaskSelect });
}

export async function deleteSubtask(id: string): Promise<{ id: string; title: string }> {
  return db.kanbanSubtask.delete({ where: { id }, select: { id: true, title: true } });
}

/** The sparse order for dropping `movingId` at `index` of its card's list. */
export async function subtaskOrderForSlot(movingId: string, index: number): Promise<number> {
  const moving = await db.kanbanSubtask.findUniqueOrThrow({
    where: { id: movingId },
    select: { cardId: true },
  });
  const siblings = await db.kanbanSubtask.findMany({
    where: { cardId: moving.cardId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  return orderForSlot(siblings, index, movingId);
}

export function progressOf(subtasks: { done: boolean }[]): { done: number; total: number } {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

// ─── NEO Ledger ──────────────────────────────────────────────────────────────

/**
 * One line of a Ledger plan as an agent read it with `get_plan` (or one task
 * from `find_task`, for a project with no plan).
 */
export interface LedgerItem {
  /** The plan item id — or the task id, when there is no plan. */
  ref: string;
  /** The Ledger task the plan item links, if any. Either id matches. */
  taskId?: string | null;
  title: string;
  /** The linked task's own title, which often differs from the item's. */
  taskTitle?: string | null;
  /** Plan item ticked, or its linked task DONE. */
  done: boolean;
}

export interface LedgerSyncReport {
  card: string | null;
  /** Ticked here because the Ledger says they are done. */
  ticked: string[];
  /** Matched by title this time; their Ledger id is now remembered. */
  linked: string[];
  created: string[];
  /** Matched and already in agreement. */
  unchanged: number;
  /**
   * Ticked here, open in the Ledger. Left ticked: a sync never unticks what a
   * person ticked. Worth mentioning, though — a task re-opened in the Ledger
   * lands here.
   */
  doneHereOpenInLedger: string[];
  /** Ledger items with no line on the card (createMissing was off). */
  notOnCard: { ref: string; title: string; done: boolean }[];
  /** Lines on the card that no Ledger item matched. */
  notInLedger: string[];
}

/**
 * Mirror Ledger progress onto a card's checklist — one way, Ledger → Clerkr.
 *
 * Matching is by the remembered Ledger id first, then by title for lines that
 * have none yet — and a title match records the id, so the backfill only has
 * to guess once. Ticking is the only change made to an existing line: a line
 * the Ledger calls open but a person ticked here is reported, never unticked.
 * Nothing is ever written back to the Ledger — its own rules forbid an agent
 * marking work done there on someone's behalf.
 *
 * Without a card, only lines already linked by id are touched (across every
 * card): that's the "I just finished Ledger task X" case, where matching on a
 * title across the whole board would be far too loose.
 */
export async function syncSubtasksFromLedger(input: {
  cardId?: string | null;
  ledgerProjectId?: string | null;
  items: LedgerItem[];
  createMissing?: boolean;
}): Promise<LedgerSyncReport> {
  return input.cardId
    ? syncCard(input.cardId, input.items, input.createMissing ?? false, input.ledgerProjectId)
    : syncByRef(input.items);
}

async function syncCard(
  cardId: string,
  items: LedgerItem[],
  createMissing: boolean,
  ledgerProjectId?: string | null,
): Promise<LedgerSyncReport> {
  const card = await db.kanbanCard.findUniqueOrThrow({
    where: { id: cardId },
    select: {
      number: true,
      subtasks: { orderBy: { order: "asc" }, select: subtaskSelect },
    },
  });
  const lines = card.subtasks;
  const byRef = new Map(lines.filter((s) => s.ledgerRef).map((s) => [s.ledgerRef!, s]));
  const claimed = new Set<string>();
  const now = new Date();

  const report: LedgerSyncReport = {
    card: `#${card.number}`,
    ticked: [],
    linked: [],
    created: [],
    unchanged: 0,
    doneHereOpenInLedger: [],
    notOnCard: [],
    notInLedger: [],
  };
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  let order = (lines.at(-1)?.order ?? 0) + ORDER_GAP;

  for (const item of items) {
    const refs = [item.ref, item.taskId].filter((r): r is string => Boolean(r));
    let line = refs.map((r) => byRef.get(r)).find((s) => s && !claimed.has(s.id));
    let linkedNow = false;

    if (!line) {
      const keys = new Set(
        [item.title, item.taskTitle]
          .filter((t): t is string => Boolean(t?.trim()))
          .map(ledgerMatchKey),
      );
      line = lines.find((s) => !claimed.has(s.id) && !s.ledgerRef && keys.has(ledgerMatchKey(s.title)));
      linkedNow = Boolean(line);
    }

    if (!line) {
      if (createMissing) {
        writes.push(
          db.kanbanSubtask.create({
            data: {
              cardId,
              title: item.title.trim(),
              done: item.done,
              doneAt: item.done ? now : null,
              order,
              ledgerRef: item.ref,
            },
          }),
        );
        order += ORDER_GAP;
        report.created.push(item.title.trim());
      } else {
        report.notOnCard.push({ ref: item.ref, title: item.title, done: item.done });
      }
      continue;
    }

    claimed.add(line.id);
    const data: Prisma.KanbanSubtaskUpdateInput = {};
    if (linkedNow) {
      data.ledgerRef = item.ref;
      report.linked.push(line.title);
    }
    if (item.done && !line.done) {
      data.done = true;
      data.doneAt = now;
      report.ticked.push(line.title);
    } else if (!item.done && line.done) {
      report.doneHereOpenInLedger.push(line.title);
    }

    if (Object.keys(data).length > 0) {
      writes.push(db.kanbanSubtask.update({ where: { id: line.id }, data }));
    } else {
      report.unchanged += 1;
    }
  }

  report.notInLedger = lines.filter((s) => !claimed.has(s.id)).map((s) => s.title);

  writes.push(
    db.kanbanCard.update({
      where: { id: cardId },
      data: {
        ledgerSyncedAt: now,
        ...(ledgerProjectId?.trim() ? { ledgerProjectId: ledgerProjectId.trim() } : {}),
      },
    }),
  );
  await db.$transaction(writes);
  return report;
}

async function syncByRef(items: LedgerItem[]): Promise<LedgerSyncReport> {
  const doneByRef = new Map<string, boolean>();
  for (const item of items) {
    for (const ref of [item.ref, item.taskId]) {
      if (ref) doneByRef.set(ref, (doneByRef.get(ref) ?? false) || item.done);
    }
  }

  const lines = await db.kanbanSubtask.findMany({
    where: { ledgerRef: { in: [...doneByRef.keys()] } },
    select: { id: true, title: true, done: true, ledgerRef: true, card: { select: { number: true } } },
  });

  const report: LedgerSyncReport = {
    card: null,
    ticked: [],
    linked: [],
    created: [],
    unchanged: 0,
    doneHereOpenInLedger: [],
    notOnCard: [],
    notInLedger: [],
  };
  const now = new Date();
  const toTick: string[] = [];

  for (const line of lines) {
    const label = `#${line.card.number} ${line.title}`;
    const done = doneByRef.get(line.ledgerRef!) ?? false;
    if (done && !line.done) {
      toTick.push(line.id);
      report.ticked.push(label);
    } else if (!done && line.done) {
      report.doneHereOpenInLedger.push(label);
    } else {
      report.unchanged += 1;
    }
  }

  const matched = new Set(lines.map((l) => l.ledgerRef));
  report.notOnCard = items
    .filter((i) => !matched.has(i.ref) && !(i.taskId && matched.has(i.taskId)))
    .map((i) => ({ ref: i.ref, title: i.title, done: i.done }));

  if (toTick.length) {
    await db.kanbanSubtask.updateMany({
      where: { id: { in: toTick } },
      data: { done: true, doneAt: now },
    });
  }
  return report;
}

/**
 * Every card carrying a Ledger link, with its checklist — what a sync pass
 * starts from.
 */
export async function ledgerLinkedCards() {
  const cards = await db.kanbanCard.findMany({
    where: { ledgerUrl: { not: null } },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      title: true,
      ledgerUrl: true,
      ledgerProjectId: true,
      ledgerSyncedAt: true,
      completedAt: true,
      column: { select: { name: true, board: { select: { name: true } } } },
      subtasks: { orderBy: { order: "asc" }, select: subtaskSelect },
    },
  });
  return cards.map((c) => ({
    ref: `#${c.number}`,
    id: c.id,
    title: c.title,
    board: c.column.board.name,
    column: c.column.name,
    done: Boolean(c.completedAt),
    ledgerUrl: c.ledgerUrl,
    ledgerProjectId: c.ledgerProjectId,
    ledgerSyncedAt: c.ledgerSyncedAt,
    progress: progressOf(c.subtasks),
    subtasks: c.subtasks,
  }));
}
