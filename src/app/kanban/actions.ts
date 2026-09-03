"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { attachImages } from "@/lib/attachments";
import { db } from "@/lib/db";
import {
  clampConfidence,
  columnSelect,
  completionFor,
  createCard,
  defaultColumnId,
  endOfColumnOrder,
} from "@/lib/kanban";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const attachmentSchema = z.object({
  dataUrl: z.string().min(1),
  fileName: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// ─── Cards ───────────────────────────────────────────────────────────────────

const createInput = z.object({
  title: z.string().trim().min(1, "Give it a title"),
  description: z.string().optional(),
  columnId: z.string().optional(),
  confidence: z.number().int().min(0).max(5).optional(),
  themeTag: z.string().optional(),
  dueDate: z.string().optional(),
  featureId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(12).optional(),
});

export async function createCardAction(
  input: z.infer<typeof createInput>,
): Promise<{ id: string }> {
  const session = await requireSession();
  const parsed = createInput.parse(input);

  const card = await createCard({
    title: parsed.title,
    description: parsed.description,
    columnId: parsed.columnId || null,
    confidence: parsed.confidence,
    themeTag: parsed.themeTag,
    dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
    featureId: parsed.featureId || null,
  });

  await attachImages(parsed.attachments, { kind: "kanbanCard", id: card.id }, session.user.id);
  revalidatePath("/kanban");
  return { id: card.id };
}

const moveInput = z.object({
  id: z.string().min(1),
  columnId: z.string().min(1),
  order: z.number().int(),
});

/** Drag autosave. The `completedAt` stamp is derived from the destination
 *  column's isDone flag — moving a card is the only way it gets set. */
export async function moveCard(input: z.infer<typeof moveInput>): Promise<void> {
  await requireSession();
  const parsed = moveInput.parse(input);

  const current = await db.kanbanCard.findUnique({
    where: { id: parsed.id },
    select: { completedAt: true },
  });

  await db.kanbanCard.update({
    where: { id: parsed.id },
    data: {
      columnId: parsed.columnId,
      order: parsed.order,
      completedAt: await completionFor(parsed.columnId, current?.completedAt ?? null),
    },
  });
  revalidatePath("/kanban");
}

const updateInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().int().min(0).max(5).optional(),
  themeTag: z.string().nullable().optional(),
  blocked: z.boolean().optional(),
  blockerNote: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
});

export async function updateCard(input: z.infer<typeof updateInput>): Promise<void> {
  await requireSession();
  const { id, ...rest } = updateInput.parse(input);

  await db.kanbanCard.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.description !== undefined ? { description: rest.description?.trim() || null } : {}),
      ...(rest.confidence !== undefined ? { confidence: clampConfidence(rest.confidence) } : {}),
      ...(rest.themeTag !== undefined ? { themeTag: rest.themeTag?.trim() || null } : {}),
      ...(rest.blocked !== undefined
        ? { blocked: rest.blocked, ...(rest.blocked ? {} : { blockerNote: null }) }
        : {}),
      ...(rest.blockerNote !== undefined && rest.blocked !== false
        ? { blockerNote: rest.blockerNote?.trim() || null }
        : {}),
      ...(rest.dueDate !== undefined
        ? { dueDate: rest.dueDate ? new Date(rest.dueDate) : null }
        : {}),
      ...(rest.featureId !== undefined ? { featureId: rest.featureId || null } : {}),
    },
  });
  revalidatePath("/kanban");
}

export async function deleteCard(id: string): Promise<void> {
  await requireSession();
  await db.kanbanCard.delete({ where: { id } });
  revalidatePath("/kanban");
}

export async function addCardAttachments(
  cardId: string,
  attachments: z.infer<typeof attachmentSchema>[],
): Promise<void> {
  const session = await requireSession();
  const parsed = z.array(attachmentSchema).max(12).parse(attachments);
  await attachImages(parsed, { kind: "kanbanCard", id: cardId }, session.user.id);
  revalidatePath("/kanban");
}

export async function deleteCardAttachment(id: string): Promise<void> {
  await requireSession();
  await db.attachment.delete({ where: { id } });
  revalidatePath("/kanban");
}

// ─── Columns ─────────────────────────────────────────────────────────────────
// The point of the whole rewrite: the workflow is data, so this is ordinary
// CRUD rather than a deploy.

const columnInput = z.object({
  name: z.string().trim().min(1, "Give the column a name").max(60),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value").optional(),
  icon: z.string().optional(),
  isDone: z.boolean().optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

export async function createColumn(input: z.infer<typeof columnInput>) {
  await requireSession();
  const parsed = columnInput.parse(input);

  const slug = await uniqueSlug(slugify(parsed.name), async (c) =>
    Boolean(await db.kanbanColumn.findUnique({ where: { slug: c }, select: { id: true } })),
  );
  const last = await db.kanbanColumn.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const column = await db.kanbanColumn.create({
    data: {
      slug,
      name: parsed.name,
      description: parsed.description?.trim() || null,
      color: parsed.color ?? "#8E8E93",
      icon: parsed.icon ?? "Circle",
      isDone: parsed.isDone ?? false,
      wipLimit: parsed.wipLimit ?? null,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
    select: columnSelect,
  });
  revalidatePath("/kanban");
  return column;
}

const columnUpdateInput = columnInput.partial().extend({ id: z.string().min(1) });

export async function updateColumn(input: z.infer<typeof columnUpdateInput>): Promise<void> {
  await requireSession();
  const { id, ...rest } = columnUpdateInput.parse(input);

  await db.kanbanColumn.update({
    where: { id },
    data: {
      ...(rest.name !== undefined ? { name: rest.name } : {}),
      ...(rest.description !== undefined ? { description: rest.description?.trim() || null } : {}),
      ...(rest.color !== undefined ? { color: rest.color } : {}),
      ...(rest.icon !== undefined ? { icon: rest.icon } : {}),
      ...(rest.wipLimit !== undefined ? { wipLimit: rest.wipLimit } : {}),
      ...(rest.isDone !== undefined ? { isDone: rest.isDone } : {}),
    },
  });

  // Flipping the done flag has to catch up every card already sitting there,
  // otherwise the column says "done" while its cards say otherwise.
  if (rest.isDone !== undefined) {
    await db.kanbanCard.updateMany({
      where: { columnId: id, ...(rest.isDone ? { completedAt: null } : {}) },
      data: { completedAt: rest.isDone ? new Date() : null },
    });
  }

  revalidatePath("/kanban");
}

/** Exactly one default. Clearing the others is part of setting the new one. */
export async function setDefaultColumn(id: string): Promise<void> {
  await requireSession();
  await db.$transaction([
    db.kanbanColumn.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    db.kanbanColumn.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/kanban");
}

export async function reorderColumns(orderedIds: string[]): Promise<void> {
  await requireSession();
  const ids = z.array(z.string().min(1)).min(1).parse(orderedIds);
  await db.$transaction(
    ids.map((id, i) =>
      db.kanbanColumn.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } }),
    ),
  );
  revalidatePath("/kanban");
}

/**
 * Deleting a column never deletes the work in it. `onDelete: Restrict` means
 * the database refuses outright, so the caller has to say where the cards go —
 * and if they don't, this explains rather than throwing a foreign-key error.
 */
export async function deleteColumn(id: string, moveCardsTo?: string): Promise<void> {
  await requireSession();

  const column = await db.kanbanColumn.findUnique({
    where: { id },
    select: { id: true, name: true, isDefault: true, _count: { select: { cards: true } } },
  });
  if (!column) return;

  const remaining = await db.kanbanColumn.count();
  if (remaining <= 1) throw new Error("A board needs at least one column.");

  if (column._count.cards > 0) {
    if (!moveCardsTo) {
      throw new Error(
        `“${column.name}” still holds ${column._count.cards} card${
          column._count.cards === 1 ? "" : "s"
        }. Choose a column to move them to first.`,
      );
    }
    if (moveCardsTo === id) throw new Error("Cards can't be moved into the column being deleted.");

    // Append rather than preserve order: two columns' orderings interleaved by
    // raw value would shuffle the destination.
    let next = await endOfColumnOrder(moveCardsTo);
    const cards = await db.kanbanCard.findMany({
      where: { columnId: id },
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
            order: (next += 1000),
            completedAt: completedAt ? (c.completedAt ?? new Date()) : null,
          },
        }),
      ),
    );
  }

  await db.kanbanColumn.delete({ where: { id } });

  // The board must always have somewhere for an unrouted card to land.
  if (column.isDefault) {
    const first = await db.kanbanColumn.findFirst({ orderBy: { sortOrder: "asc" } });
    if (first) await db.kanbanColumn.update({ where: { id: first.id }, data: { isDefault: true } });
  }

  revalidatePath("/kanban");
}

export async function listColumns() {
  await requireSession();
  return db.kanbanColumn.findMany({ orderBy: { sortOrder: "asc" }, select: columnSelect });
}

export async function quickAddCard(columnId: string, title: string): Promise<void> {
  await requireSession();
  const clean = z.string().trim().min(1).max(300).parse(title);
  await createCard({ title: clean, columnId: columnId || (await defaultColumnId()) });
  revalidatePath("/kanban");
}
