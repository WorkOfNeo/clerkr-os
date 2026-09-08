import type { Prisma } from "@prisma/client";

import { attachmentSelect } from "@/lib/attachments";
import { db } from "@/lib/db";
import { ORDER_GAP, orderForSlot } from "@/lib/kanban-order";
import { slugify, uniqueSlug } from "@/lib/slug";
import { resolveTicket } from "@/lib/tickets";

/**
 * The board. Columns are rows, not an enum, so the workflow itself is editable
 * — see the note on KanbanColumn in schema.prisma for why that differs from
 * TicketStatus.
 *
 * Everything that writes a card goes through here (server actions, MCP tools,
 * chat intake) so slugging, sparse ordering and the `completedAt` stamp behave
 * the same however a card arrives.
 */

// Sparse ordering (gaps of 1000) lives in lib/kanban-order.ts so the drag
// handler on the client can share it without importing Prisma.
export { orderForSlot };

export const boardSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  sortOrder: true,
  isDefault: true,
  _count: { select: { columns: true } },
} satisfies Prisma.KanbanBoardSelect;

export const columnSelect = {
  id: true,
  boardId: true,
  slug: true,
  name: true,
  description: true,
  color: true,
  icon: true,
  sortOrder: true,
  isDone: true,
  isDefault: true,
  wipLimit: true,
  _count: { select: { cards: true } },
} satisfies Prisma.KanbanColumnSelect;

export const cardSelect = {
  id: true,
  slug: true,
  number: true,
  title: true,
  description: true,
  columnId: true,
  order: true,
  confidence: true,
  themeTag: true,
  blocked: true,
  blockerNote: true,
  dueDate: true,
  completedAt: true,
  featureId: true,
  createdAt: true,
  updatedAt: true,
  ticketId: true,
  feature: { select: { id: true, slug: true, title: true } },
  ticket: { select: { id: true, slug: true, number: true, title: true, status: true } },
  attachments: { select: attachmentSelect },
} satisfies Prisma.KanbanCardSelect;

export type KanbanBoardRow = Prisma.KanbanBoardGetPayload<{ select: typeof boardSelect }>;
export type KanbanColumnRow = Prisma.KanbanColumnGetPayload<{ select: typeof columnSelect }>;
export type KanbanCardRow = Prisma.KanbanCardGetPayload<{ select: typeof cardSelect }>;

/** The columns the board starts life with. Only ever used when the board is
 *  completely empty — after that the columns are the team's to shape. */
export const DEFAULT_COLUMNS = [
  { name: "Backlog", color: "#8E8E93", icon: "Circle", isDone: false, isDefault: true },
  { name: "To Do", color: "#0A84FF", icon: "CircleDot", isDone: false, isDefault: false },
  { name: "In Progress", color: "#FF9F0A", icon: "CircleDashed", isDone: false, isDefault: false },
  { name: "For Review", color: "#BF5AF2", icon: "CircleDotDashed", isDone: false, isDefault: false },
  { name: "Done", color: "#30D158", icon: "CheckCircle2", isDone: true, isDefault: false },
] as const;

/**
 * Read the boards, creating a first one on an empty install. A board with no
 * columns has no sensible "add column" affordance, and a first run shouldn't be
 * a setup chore — so the starter set is seeded rather than shipped as a seed
 * step.
 */
export async function ensureBoards(): Promise<KanbanBoardRow[]> {
  const existing = await db.kanbanBoard.findMany({
    orderBy: { sortOrder: "asc" },
    select: boardSelect,
  });
  if (existing.length > 0) return existing;

  const board = await db.kanbanBoard.create({
    data: { slug: "main", name: "Main", sortOrder: 10, isDefault: true },
    select: { id: true },
  });
  await seedColumns(board.id);
  return db.kanbanBoard.findMany({ orderBy: { sortOrder: "asc" }, select: boardSelect });
}

/** The starter columns a brand-new board opens with. */
export async function seedColumns(boardId: string): Promise<void> {
  await db.kanbanColumn.createMany({
    data: DEFAULT_COLUMNS.map((c, i) => ({
      boardId,
      slug: slugify(c.name),
      name: c.name,
      color: c.color,
      icon: c.icon,
      isDone: c.isDone,
      isDefault: c.isDefault,
      sortOrder: (i + 1) * 10,
    })),
    skipDuplicates: true,
  });
}

/**
 * Every board with its columns, in order — what a "choose where this goes"
 * picker needs, and what the assistant is shown so it names a board and column
 * that actually exist instead of guessing Now/Next/Later.
 */
export async function boardsWithColumns() {
  await ensureBoards();
  return db.kanbanBoard.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      isDefault: true,
      columns: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          color: true,
          icon: true,
          isDone: true,
          isDefault: true,
          wipLimit: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });
}

export type BoardWithColumns = Awaited<ReturnType<typeof boardsWithColumns>>[number];

/** Columns of one board, in board order. */
export async function columnsFor(boardId: string): Promise<KanbanColumnRow[]> {
  return db.kanbanColumn.findMany({
    where: { boardId },
    orderBy: { sortOrder: "asc" },
    select: columnSelect,
  });
}

/** Resolve a board by id, slug or name. */
export async function resolveBoardId(ref?: string | null): Promise<string | null> {
  if (!ref?.trim()) return null;
  const needle = ref.trim();
  const board = await db.kanbanBoard.findFirst({
    where: {
      OR: [{ id: needle }, { slug: slugify(needle) }, { name: { equals: needle, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (!board) throw new Error(`No such kanban board: ${ref}`);
  return board.id;
}

/** The board /kanban opens on, and where an unrouted card lands. */
export async function defaultBoardId(): Promise<string> {
  const boards = await ensureBoards();
  const board = boards.find((b) => b.isDefault) ?? boards[0];
  if (!board) throw new Error("There are no kanban boards.");
  return board.id;
}

/** Resolve a column by id, slug or name — MCP and chat callers pass whichever
 *  they have, and "In Progress" is what a human types. */
export async function resolveColumnId(
  ref?: string | null,
  boardId?: string | null,
): Promise<string | null> {
  if (!ref?.trim()) return null;
  const needle = ref.trim();
  const column = await db.kanbanColumn.findFirst({
    where: {
      ...(boardId ? { boardId } : {}),
      OR: [{ id: needle }, { slug: slugify(needle) }, { name: { equals: needle, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (!column) throw new Error(`No such kanban column: ${ref}`);
  return column.id;
}

/** The column a card lands in when nobody said. Falls back to the leftmost so
 *  a board whose default was deleted still accepts cards. */
export async function defaultColumnId(boardId?: string | null): Promise<string> {
  const board = boardId ?? (await defaultBoardId());
  const columns = await columnsFor(board);
  const fallback = columns.find((c) => c.isDefault) ?? columns[0];
  if (!fallback) throw new Error("That board has no columns.");
  return fallback.id;
}

export async function endOfColumnOrder(columnId: string): Promise<number> {
  const last = await db.kanbanCard.findFirst({
    where: { columnId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? 0) + ORDER_GAP;
}

/** Whether landing in this column means the work is finished. */
export async function isDoneColumn(columnId: string): Promise<boolean> {
  const column = await db.kanbanColumn.findUnique({
    where: { id: columnId },
    select: { isDone: true },
  });
  return column?.isDone ?? false;
}

/**
 * `completedAt` is derived, never set by hand: it is stamped when a card enters
 * a column the user marked done and cleared when it leaves. That is the whole
 * mechanism behind "say that when a status is X, it's done" — the flag lives on
 * the column, the consequence lands on the card.
 */
export async function completionFor(
  columnId: string,
  current: Date | null,
): Promise<Date | null> {
  const done = await isDoneColumn(columnId);
  if (done) return current ?? new Date();
  return null;
}

export interface CreateCardInput {
  title: string;
  description?: string | null;
  board?: string | null; // id, slug or name — scopes the column lookup
  column?: string | null; // id, slug or name
  columnId?: string | null;
  confidence?: number;
  themeTag?: string | null;
  dueDate?: Date | null;
  featureId?: string | null;
  ticketId?: string | null;
  blocked?: boolean;
  blockerNote?: string | null;
}

export async function createCard(input: CreateCardInput) {
  const boardId = input.board ? await resolveBoardId(input.board) : null;
  const columnId =
    input.columnId ??
    (await resolveColumnId(input.column, boardId)) ??
    (await defaultColumnId(boardId));

  const slug = await uniqueSlug(slugify(input.title), async (c) =>
    Boolean(await db.kanbanCard.findUnique({ where: { slug: c }, select: { id: true } })),
  );

  return db.kanbanCard.create({
    data: {
      slug,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      columnId,
      order: await endOfColumnOrder(columnId),
      confidence: clampConfidence(input.confidence),
      themeTag: input.themeTag?.trim() || null,
      dueDate: input.dueDate ?? null,
      featureId: input.featureId ?? null,
      ticketId: input.ticketId ?? null,
      blocked: input.blocked ?? false,
      blockerNote: input.blockerNote?.trim() || null,
      completedAt: await completionFor(columnId, null),
    },
    select: cardSelect,
  });
}

/** Resolve a card by id, slug or #number — same convenience as tickets. */
export async function resolveCard(ref: string) {
  const asNumber = Number(String(ref).replace(/^#/, ""));
  const card = await db.kanbanCard.findFirst({
    where: {
      OR: [
        { id: ref },
        { slug: ref },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
      ],
    },
    select: { id: true, slug: true, number: true, title: true, columnId: true, completedAt: true },
  });
  if (!card) throw new Error(`Kanban card not found: ${ref}`);
  return card;
}

export function clampConfidence(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

export interface UpdateCardInput {
  title?: string;
  description?: string | null;
  confidence?: number;
  themeTag?: string | null;
  dueDate?: Date | null;
  blocked?: boolean;
  blockerNote?: string | null;
  featureId?: string | null;
  ticketId?: string | null;
  /** Target column by id, slug or name. Moving is what stamps completedAt. */
  column?: string | null;
  columnId?: string | null;
  /** Scopes the column lookup — two boards may each have a "To Do". */
  board?: string | null;
}

/**
 * Edit a card, including moving it.
 *
 * The one mapping from "fields someone changed" to a row update, shared by the
 * card panel, MCP and the assistant. Three copies of this drifted apart the
 * moment one of them learned about a new field — and the `completedAt` rule in
 * particular has to hold everywhere: it is derived from the destination
 * column's isDone flag and is never set by hand.
 */
export async function updateCardFields(cardId: string, patch: UpdateCardInput) {
  const data: Prisma.KanbanCardUncheckedUpdateInput = {};

  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.confidence !== undefined) data.confidence = clampConfidence(patch.confidence);
  if (patch.themeTag !== undefined) data.themeTag = patch.themeTag?.trim() || null;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ?? null;
  if (patch.featureId !== undefined) data.featureId = patch.featureId || null;
  if (patch.ticketId !== undefined) data.ticketId = patch.ticketId || null;

  // Unblocking drops the note with it; the note alone only lands when the card
  // isn't being unblocked in the same breath.
  if (patch.blocked !== undefined) {
    data.blocked = patch.blocked;
    if (!patch.blocked) data.blockerNote = null;
  }
  if (patch.blockerNote !== undefined && patch.blocked !== false) {
    data.blockerNote = patch.blockerNote?.trim() || null;
  }

  const boardId = patch.board ? await resolveBoardId(patch.board) : null;
  const columnId = patch.columnId ?? (await resolveColumnId(patch.column, boardId));
  if (columnId) {
    const current = await db.kanbanCard.findUnique({
      where: { id: cardId },
      select: { completedAt: true },
    });
    data.columnId = columnId;
    data.order = await endOfColumnOrder(columnId);
    data.completedAt = await completionFor(columnId, current?.completedAt ?? null);
  }

  return db.kanbanCard.update({ where: { id: cardId }, data, select: cardSelect });
}

export interface UpdateColumnInput {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  isDone?: boolean;
  wipLimit?: number | null;
}

/**
 * Edit a column. Flipping `isDone` backfills the cards already sitting in it —
 * a column that says "done" while its contents say otherwise is the one state
 * the board must never be in.
 */
export async function updateColumnFields(columnId: string, patch: UpdateColumnInput) {
  const column = await db.kanbanColumn.update({
    where: { id: columnId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.wipLimit !== undefined ? { wipLimit: patch.wipLimit } : {}),
      ...(patch.isDone !== undefined ? { isDone: patch.isDone } : {}),
    },
    select: columnSelect,
  });

  if (patch.isDone !== undefined) {
    await db.kanbanCard.updateMany({
      where: { columnId, ...(patch.isDone ? { completedAt: null } : {}) },
      data: { completedAt: patch.isDone ? new Date() : null },
    });
  }

  return column;
}

/**
 * Delete a column — never the work in it.
 *
 * `onDelete: Restrict` means the database refuses while cards remain, so the
 * caller has to say where they go; this explains that in a sentence rather than
 * letting a foreign-key error surface. A board can't drop below one column
 * either, or there'd be nowhere for a card to land.
 */
export async function removeColumn(
  columnId: string,
  moveCardsTo?: string | null,
): Promise<{ id: string; name: string; movedCards: number }> {
  const column = await db.kanbanColumn.findUnique({
    where: { id: columnId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      boardId: true,
      _count: { select: { cards: true } },
    },
  });
  if (!column) throw new Error("That column no longer exists.");

  const remaining = await db.kanbanColumn.count({ where: { boardId: column.boardId } });
  if (remaining <= 1) throw new Error("A board needs at least one column.");

  let movedCards = 0;
  if (column._count.cards > 0) {
    if (!moveCardsTo) {
      throw new Error(
        `“${column.name}” still holds ${column._count.cards} card${
          column._count.cards === 1 ? "" : "s"
        }. Choose a column to move them to first.`,
      );
    }
    if (moveCardsTo === columnId) {
      throw new Error("Cards can't be moved into the column being deleted.");
    }

    // Append rather than preserve order: two columns' orderings interleaved by
    // raw value would shuffle the destination.
    let next = await endOfColumnOrder(moveCardsTo);
    const cards = await db.kanbanCard.findMany({
      where: { columnId },
      orderBy: { order: "asc" },
      select: { id: true, completedAt: true },
    });
    const completedAt = await completionFor(moveCardsTo, new Date());
    await db.$transaction(
      cards.map((c) =>
        db.kanbanCard.update({
          where: { id: c.id },
          data: {
            columnId: moveCardsTo,
            order: (next += ORDER_GAP),
            completedAt: completedAt ? (c.completedAt ?? new Date()) : null,
          },
        }),
      ),
    );
    movedCards = cards.length;
  }

  await db.kanbanColumn.delete({ where: { id: columnId } });

  // The board must always have somewhere for an unrouted card to land.
  if (column.isDefault) {
    const first = await db.kanbanColumn.findFirst({
      where: { boardId: column.boardId },
      orderBy: { sortOrder: "asc" },
    });
    if (first) await db.kanbanColumn.update({ where: { id: first.id }, data: { isDefault: true } });
  }

  return { id: column.id, name: column.name, movedCards };
}

export interface CardFromTicketInput {
  ticket: string; // id, slug or #number
  board?: string | null;
  column?: string | null;
  columnId?: string | null;
  /** Copy the ticket's body into the card's notes. Default true. */
  includeBody?: boolean;
  themeTag?: string | null;
  dueDate?: Date | null;
}

/**
 * Put a ticket on a board.
 *
 * The card takes the ticket's words but is its own record from that moment: the
 * ticket stays the REPORT ("this is broken, here's a screenshot"), the card
 * becomes the WORK ("someone is doing it, it's in For Review"). Editing one
 * deliberately doesn't rewrite the other — the sentence a lawyer used to
 * describe a bug is rarely the sentence you want on the board — and `ticketId`
 * is what keeps them pointing at each other afterwards.
 *
 * Single write path, shared by the ticket page, MCP and the assistant, so it
 * goes through createCard and gets the same slugging, sparse ordering and
 * completedAt stamp as any other card.
 */
export async function cardFromTicket(input: CardFromTicketInput) {
  const found = await resolveTicket(input.ticket);
  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: found.id },
    select: { id: true, slug: true, number: true, title: true, body: true },
  });

  return createCard({
    title: ticket.title,
    description: input.includeBody === false ? null : ticket.body,
    board: input.board,
    column: input.column,
    columnId: input.columnId,
    themeTag: input.themeTag,
    dueDate: input.dueDate ?? null,
    ticketId: ticket.id,
  });
}

/**
 * The cards already raised from a ticket. Sending the same ticket twice is
 * allowed — the same report can be worked on a dev board and a release board —
 * so rather than blocking it, the UI shows what's already there and lets you
 * open it instead.
 */
export async function cardsForTicket(ticketId: string) {
  return db.kanbanCard.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      number: true,
      title: true,
      completedAt: true,
      column: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          isDone: true,
          board: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
}

export type TicketCardRow = Awaited<ReturnType<typeof cardsForTicket>>[number];
