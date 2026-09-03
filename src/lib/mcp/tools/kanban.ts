import { z } from "zod";

import { db } from "@/lib/db";
import {
  cardSelect,
  clampConfidence,
  columnSelect,
  completionFor,
  createCard,
  endOfColumnOrder,
  ensureColumns,
  resolveCard,
  resolveColumnId,
} from "@/lib/kanban";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

// Kanban tools. The board's columns are rows the team edits, so every tool
// takes a column by NAME as readily as by id — "In Progress" is what a human
// says, and the model shouldn't have to look up a uuid to move a card.

const idSchema = z.object({ ref: z.string().min(1) });

async function resolveFeatureId(idOrSlug: string): Promise<string> {
  const feature = await db.feature.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!feature) throw new Error(`Feature not found: ${idOrSlug}`);
  return feature.id;
}

export const KANBAN_TOOLS: ToolDef[] = [
  {
    name: "list_kanban_columns",
    description:
      "List the board's columns in order, with their card counts and which ones are " +
      "terminal (isDone). Call this before creating or moving a card so you use a column " +
      "that actually exists — the columns are editable, so never assume Now/Next/Later or " +
      "To Do/Doing/Done.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const columns = await ensureColumns();
      return { columns, count: columns.length };
    },
  },

  {
    name: "create_kanban_column",
    description:
      "Add a column to the board. Set isDone when landing in it means the work is " +
      "finished — cards moved there get stamped complete. Don't invent columns " +
      "unprompted; the board's shape is the team's decision.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string", description: "Hex, e.g. '#0A84FF'." },
        isDone: { type: "boolean", description: "Landing here means finished. Default false." },
        wipLimit: { type: "integer", minimum: 1, description: "Soft ceiling on card count." },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const input = z
        .object({
          name: z.string().trim().min(1).max(60),
          description: z.string().optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          isDone: z.boolean().optional(),
          wipLimit: z.number().int().min(1).optional(),
        })
        .parse(args);

      const slug = await uniqueSlug(slugify(input.name), async (c) =>
        Boolean(await db.kanbanColumn.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const last = await db.kanbanColumn.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return db.kanbanColumn.create({
        data: {
          slug,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "#8E8E93",
          icon: "Circle",
          isDone: input.isDone ?? false,
          wipLimit: input.wipLimit ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 10,
        },
        select: columnSelect,
      });
    },
  },

  {
    name: "create_kanban_card",
    description:
      "Add a card to the board. `column` takes a name, slug or id — omit it and the card " +
      "lands in the board's default column. Optionally point it at a Feature Library entry.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        column: { type: "string", description: "Column name, slug or id. Defaults to the board default." },
        confidence: { type: "integer", minimum: 0, maximum: 5 },
        themeTag: { type: "string", description: "Short theme label, e.g. 'AI', 'Integrations'." },
        dueDate: { type: "string", description: "ISO date." },
        featureId: { type: "string", description: "Feature id or slug to link." },
      },
      required: ["title"],
    },
    handler: async (args) => {
      const input = z
        .object({
          title: z.string().min(1),
          description: z.string().optional(),
          column: z.string().optional(),
          confidence: z.number().int().min(0).max(5).optional(),
          themeTag: z.string().optional(),
          dueDate: z.string().optional(),
          featureId: z.string().optional(),
        })
        .parse(args);

      return createCard({
        title: input.title,
        description: input.description,
        column: input.column,
        confidence: input.confidence,
        themeTag: input.themeTag,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        featureId: input.featureId ? await resolveFeatureId(input.featureId) : null,
      });
    },
  },

  {
    name: "move_kanban_card",
    description:
      "Move a card to another column. `ref` accepts an id, slug or #number; `column` a " +
      "name, slug or id. Appends to the end of the target column. If the target column is " +
      "marked done, the card is stamped complete automatically — don't try to set that " +
      "yourself.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number." },
        column: { type: "string", description: "Target column name, slug or id." },
      },
      required: ["ref", "column"],
    },
    handler: async (args) => {
      const input = z.object({ ref: z.string().min(1), column: z.string().min(1) }).parse(args);
      const card = await resolveCard(input.ref);
      const columnId = await resolveColumnId(input.column);
      if (!columnId) throw new Error(`No such kanban column: ${input.column}`);

      return db.kanbanCard.update({
        where: { id: card.id },
        data: {
          columnId,
          order: await endOfColumnOrder(columnId),
          completedAt: await completionFor(columnId, card.completedAt),
        },
        select: cardSelect,
      });
    },
  },

  {
    name: "update_kanban_card",
    description:
      "Update a card's fields (title, description, confidence 0-5, themeTag, dueDate, " +
      "blocked + blockerNote, linked feature). Use move_kanban_card to change columns.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number." },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        confidence: { type: "integer", minimum: 0, maximum: 5 },
        themeTag: { type: ["string", "null"] },
        dueDate: { type: ["string", "null"] },
        blocked: { type: "boolean" },
        blockerNote: { type: ["string", "null"] },
        featureId: { type: ["string", "null"], description: "Feature id or slug; null to unlink." },
      },
      required: ["ref"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().min(1),
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          confidence: z.number().int().min(0).max(5).optional(),
          themeTag: z.string().nullable().optional(),
          dueDate: z.string().nullable().optional(),
          blocked: z.boolean().optional(),
          blockerNote: z.string().nullable().optional(),
          featureId: z.string().nullable().optional(),
        })
        .parse(args);

      const card = await resolveCard(input.ref);
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.description !== undefined) data.description = input.description;
      if (input.confidence !== undefined) data.confidence = clampConfidence(input.confidence);
      if (input.themeTag !== undefined) data.themeTag = input.themeTag;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.blocked !== undefined) {
        data.blocked = input.blocked;
        if (!input.blocked) data.blockerNote = null;
      }
      if (input.blockerNote !== undefined && input.blocked !== false) {
        data.blockerNote = input.blockerNote;
      }
      if (input.featureId !== undefined) {
        data.featureId = input.featureId === null ? null : await resolveFeatureId(input.featureId);
      }

      return db.kanbanCard.update({ where: { id: card.id }, data, select: cardSelect });
    },
  },

  {
    name: "list_kanban",
    description:
      "List the board grouped by column, in board order, with linked features. Pass a " +
      "column name to read just that one.",
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", description: "Optional single column, by name/slug/id." },
      },
    },
    handler: async (args) => {
      const input = z.object({ column: z.string().optional() }).parse(args);
      const columns = await ensureColumns();
      const only = input.column ? await resolveColumnId(input.column) : null;

      const cards = await db.kanbanCard.findMany({
        where: only ? { columnId: only } : undefined,
        orderBy: { order: "asc" },
        select: cardSelect,
      });

      const board = columns
        .filter((c) => !only || c.id === only)
        .map((c) => ({
          column: { id: c.id, name: c.name, isDone: c.isDone, wipLimit: c.wipLimit },
          cards: cards.filter((card) => card.columnId === c.id),
        }));
      return { board, count: cards.length };
    },
  },

  {
    name: "delete_kanban_card",
    description:
      "Delete a card. The linked feature, if any, stays in the library. Prefer moving it " +
      "to a terminal column over deleting — that keeps the record of the decision.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string", description: "Card id, slug or #number." } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = idSchema.parse(args);
      const card = await resolveCard(ref);
      await db.kanbanCard.delete({ where: { id: card.id } });
      return { ok: true, id: card.id, title: card.title };
    },
  },
];
