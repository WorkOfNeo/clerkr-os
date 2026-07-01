import { z } from "zod";

import { db } from "@/lib/db";

import type { ToolDef } from "./types";

const colorRegex = /^#[0-9a-fA-F]{6}$/;

const upsertSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  color: z.string().regex(colorRegex, "Color must be a hex code like #10b981"),
  sortOrder: z.number().int().optional(),
  isDone: z.boolean().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

export const TAXONOMY_TOOLS: ToolDef[] = [
  {
    name: "upsert_task_status",
    description:
      "Create or update a TaskStatus row (kanban column). " +
      "`isDone: true` marks this as a terminal status (counts as done for analytics).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Omit to create a new status." },
        label: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #10b981" },
        sortOrder: { type: "integer" },
        isDone: { type: "boolean" },
      },
      required: ["label", "color"],
    },
    handler: async (args) => {
      const input = upsertSchema.parse(args);
      if (input.id) {
        return db.taskStatus.update({
          where: { id: input.id },
          data: {
            label: input.label,
            color: input.color,
            sortOrder: input.sortOrder,
            isDone: input.isDone,
          },
        });
      }
      return db.taskStatus.upsert({
        where: { label: input.label },
        create: {
          label: input.label,
          color: input.color,
          sortOrder: input.sortOrder ?? 0,
          isDone: input.isDone ?? false,
        },
        update: {
          color: input.color,
          sortOrder: input.sortOrder,
          isDone: input.isDone,
        },
      });
    },
  },

  {
    name: "delete_task_status",
    description: "Delete a TaskStatus. Fails (with a helpful error) if any task still references it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const count = await db.task.count({ where: { statusId: id } });
      if (count > 0) {
        throw new Error(
          `Cannot delete status: ${count} task(s) still reference it. Reassign them first.`,
        );
      }
      await db.taskStatus.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "upsert_task_group",
    description: "Create or update a TaskGroup row (e.g. Development, Marketing).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        color: { type: "string" },
        sortOrder: { type: "integer" },
      },
      required: ["label", "color"],
    },
    handler: async (args) => {
      const input = upsertSchema.parse(args);
      if (input.id) {
        return db.taskGroup.update({
          where: { id: input.id },
          data: { label: input.label, color: input.color, sortOrder: input.sortOrder },
        });
      }
      return db.taskGroup.upsert({
        where: { label: input.label },
        create: { label: input.label, color: input.color, sortOrder: input.sortOrder ?? 0 },
        update: { color: input.color, sortOrder: input.sortOrder },
      });
    },
  },

  {
    name: "delete_task_group",
    description: "Delete a TaskGroup. Fails if tasks still reference it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const count = await db.task.count({ where: { groupId: id } });
      if (count > 0) {
        throw new Error(
          `Cannot delete group: ${count} task(s) still reference it. Reassign them first.`,
        );
      }
      await db.taskGroup.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "upsert_task_stack",
    description: "Create or update a TaskStack row (e.g. 'Next.js', 'Prisma').",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        color: { type: "string" },
        sortOrder: { type: "integer" },
      },
      required: ["label", "color"],
    },
    handler: async (args) => {
      const input = upsertSchema.parse(args);
      if (input.id) {
        return db.taskStack.update({
          where: { id: input.id },
          data: { label: input.label, color: input.color, sortOrder: input.sortOrder },
        });
      }
      return db.taskStack.upsert({
        where: { label: input.label },
        create: { label: input.label, color: input.color, sortOrder: input.sortOrder ?? 0 },
        update: { color: input.color, sortOrder: input.sortOrder },
      });
    },
  },

  {
    name: "delete_task_stack",
    description: "Delete a TaskStack. Fails if tasks still reference it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const count = await db.task.count({ where: { stackId: id } });
      if (count > 0) {
        throw new Error(
          `Cannot delete stack: ${count} task(s) still reference it. Reassign them first.`,
        );
      }
      await db.taskStack.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "list_task_taxonomy",
    description: "Return all statuses, groups, and stacks in one call. Cheap context for the LLM.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const [statuses, groups, stacks] = await Promise.all([
        db.taskStatus.findMany({ orderBy: { sortOrder: "asc" } }),
        db.taskGroup.findMany({ orderBy: { sortOrder: "asc" } }),
        db.taskStack.findMany({ orderBy: { sortOrder: "asc" } }),
      ]);
      return { statuses, groups, stacks };
    },
  },
];
