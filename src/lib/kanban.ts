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

export const columnSelect = {
  id: true,
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
 * Read the board. Creates the starter columns on first visit rather than
 * shipping a seed step — an empty board with no columns has no "add column"
 * affordance that makes sense, and a first run shouldn't be a setup chore.
 */
export async function ensureColumns(): Promise<KanbanColumnRow[]> {
  const existing = await db.kanbanColumn.findMany({
    orderBy: { sortOrder: "asc" },
    select: columnSelect,
  });
  if (existing.length > 0) return existing;

  await db.kanbanColumn.createMany({
    data: DEFAULT_COLUMNS.map((c, i) => ({
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
  return db.kanbanColumn.findMany({ orderBy: { sortOrder: "asc" }, select: columnSelect });
}

/** Resolve a column by id, slug or name — MCP and chat callers pass whichever
 *  they have, and "In Progress" is what a human types. */
export async function resolveColumnId(ref?: string | null): Promise<string | null> {
  if (!ref?.trim()) return null;
  const needle = ref.trim();
  const column = await db.kanbanColumn.findFirst({
    where: {
      OR: [{ id: needle }, { slug: slugify(needle) }, { name: { equals: needle, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (!column) throw new Error(`No such kanban column: ${ref}`);
  return column.id;
}

/** The column a card lands in when nobody said. Falls back to the leftmost so
 *  a board whose default was deleted still accepts cards. */
export async function defaultColumnId(): Promise<string> {
  const columns = await ensureColumns();
  const fallback = columns.find((c) => c.isDefault) ?? columns[0];
  if (!fallback) throw new Error("The board has no columns.");
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
  const columnId =
    input.columnId ?? (await resolveColumnId(input.column)) ?? (await defaultColumnId());

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
