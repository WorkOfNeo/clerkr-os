import type { Prisma } from "@prisma/client";

import { attachmentSelect } from "@/lib/attachments";
import { db } from "@/lib/db";
import { ORDER_GAP, orderForSlot } from "@/lib/kanban-order";
import { slugify, uniqueSlug } from "@/lib/slug";

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
  feature: { select: { id: true, slug: true, title: true } },
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
