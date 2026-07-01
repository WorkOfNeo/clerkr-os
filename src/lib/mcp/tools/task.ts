import { z } from "zod";

import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

import { isoDate, parseDate, resolveUserId } from "./_shared";
import type { ToolDef } from "./types";

const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  statusId: z.string().optional(),
  statusLabel: z.string().optional(),
  groupId: z.string().optional(),
  groupLabel: z.string().optional(),
  stackId: z.string().optional(),
  stackLabel: z.string().optional(),
  sprintId: z.string().optional(),
  sprintSlug: z.string().optional(),
  assigneeEmails: z.array(z.string().email()).optional(),
  dueDate: isoDate.optional(),
  plannedDate: isoDate.optional(),
  estimatedHours: z.number().optional(),
  loggedHours: z.number().optional(),
  priority: priorityEnum.optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  statusId: z.string().optional(),
  statusLabel: z.string().optional(),
  groupId: z.string().nullable().optional(),
  groupLabel: z.string().nullable().optional(),
  stackId: z.string().nullable().optional(),
  stackLabel: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  sprintSlug: z.string().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  plannedDate: isoDate.nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  loggedHours: z.number().nullable().optional(),
  priority: priorityEnum.optional(),
});

const moveSchema = z.object({
  id: z.string().min(1),
  statusId: z.string().optional(),
  statusLabel: z.string().optional(),
  sprintId: z.string().nullable().optional(),
  sprintSlug: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

const listSchema = z.object({
  sprintId: z.string().optional(),
  sprintSlug: z.string().optional(),
  statusId: z.string().optional(),
  statusLabel: z.string().optional(),
  groupLabel: z.string().optional(),
  stackLabel: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  priority: priorityEnum.optional(),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const taskSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  dueDate: true,
  plannedDate: true,
  estimatedHours: true,
  loggedHours: true,
  priority: true,
  order: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  status: { select: { id: true, label: true, color: true, isDone: true } },
  group: { select: { id: true, label: true, color: true } },
  stack: { select: { id: true, label: true, color: true } },
  sprint: { select: { id: true, slug: true, name: true, state: true } },
  author: { select: { id: true, email: true, name: true } },
  assignees: {
    select: { user: { select: { id: true, email: true, name: true } } },
  },
  blockedBy: {
    select: { blocker: { select: { id: true, slug: true, name: true } } },
  },
} as const;

async function resolveStatusId(input: { statusId?: string; statusLabel?: string }): Promise<string | undefined> {
  if (input.statusId) return input.statusId;
  if (input.statusLabel) {
    const s = await db.taskStatus.findUnique({ where: { label: input.statusLabel } });
    if (!s) throw new Error(`Status not found: ${input.statusLabel}`);
    return s.id;
  }
  return undefined;
}

async function resolveGroupId(input: { groupId?: string | null; groupLabel?: string | null }): Promise<string | null | undefined> {
  if (input.groupId === null || input.groupLabel === null) return null;
  if (input.groupId) return input.groupId;
  if (input.groupLabel) {
    const g = await db.taskGroup.findUnique({ where: { label: input.groupLabel } });
    if (!g) throw new Error(`Group not found: ${input.groupLabel}`);
    return g.id;
  }
  return undefined;
}

async function resolveStackId(input: { stackId?: string | null; stackLabel?: string | null }): Promise<string | null | undefined> {
  if (input.stackId === null || input.stackLabel === null) return null;
  if (input.stackId) return input.stackId;
  if (input.stackLabel) {
    const s = await db.taskStack.findUnique({ where: { label: input.stackLabel } });
    if (!s) throw new Error(`Stack not found: ${input.stackLabel}`);
    return s.id;
  }
  return undefined;
}

async function resolveSprintId(input: { sprintId?: string | null; sprintSlug?: string | null }): Promise<string | null | undefined> {
  if (input.sprintId === null || input.sprintSlug === null) return null;
  if (input.sprintId) return input.sprintId;
  if (input.sprintSlug) {
    const s = await db.sprint.findUnique({ where: { slug: input.sprintSlug } });
    if (!s) throw new Error(`Sprint not found: ${input.sprintSlug}`);
    return s.id;
  }
  return undefined;
}

async function defaultStatusId(): Promise<string> {
  const first = await db.taskStatus.findFirst({ orderBy: { sortOrder: "asc" } });
  if (!first) throw new Error("No TaskStatus rows exist — seed the taxonomy first.");
  return first.id;
}

async function nextOrderInColumn(statusId: string, sprintId: string | null): Promise<number> {
  const last = await db.task.findFirst({
    where: { statusId, sprintId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? 0) + 1000;
}

export const TASK_TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description:
      "Create a sprint board task. Provide either statusId or statusLabel (label is more LLM-friendly). " +
      "Same for group/stack/sprint. Assignees by email. The author is the API token owner.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string", description: "TipTap JSON or markdown — both are accepted as strings." },
        statusId: { type: "string" },
        statusLabel: { type: "string", description: "e.g. 'To do', 'In progress'." },
        groupId: { type: "string" },
        groupLabel: { type: "string" },
        stackId: { type: "string" },
        stackLabel: { type: "string" },
        sprintId: { type: "string" },
        sprintSlug: { type: "string" },
        assigneeEmails: { type: "array", items: { type: "string", format: "email" } },
        dueDate: { type: "string" },
        plannedDate: { type: "string" },
        estimatedHours: { type: "number" },
        loggedHours: { type: "number" },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      },
      required: ["name"],
    },
    handler: async (args, ctx) => {
      const input = createSchema.parse(args);
      const statusId = (await resolveStatusId(input)) ?? (await defaultStatusId());
      const groupId = await resolveGroupId(input);
      const stackId = await resolveStackId(input);
      const sprintId = await resolveSprintId(input);

      const base = slugify(input.name);
      const slug = await uniqueSlug(base, async (s) =>
        Boolean(await db.task.findUnique({ where: { slug: s }, select: { id: true } })),
      );

      const order = await nextOrderInColumn(statusId, sprintId ?? null);

      const assigneeUserIds = input.assigneeEmails
        ? await Promise.all(input.assigneeEmails.map((e) => resolveUserId(e)))
        : [];

      const task = await db.task.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          statusId,
          groupId: groupId ?? null,
          stackId: stackId ?? null,
          sprintId: sprintId ?? null,
          dueDate: parseDate(input.dueDate) ?? null,
          plannedDate: parseDate(input.plannedDate) ?? null,
          estimatedHours: input.estimatedHours ?? null,
          loggedHours: input.loggedHours ?? null,
          priority: input.priority ?? "MEDIUM",
          order,
          authorId: ctx.userId,
          assignees: assigneeUserIds.length
            ? { create: assigneeUserIds.map((userId) => ({ userId })) }
            : undefined,
        },
        select: taskSelect,
      });
      return task;
    },
  },

  {
    name: "update_task",
    description:
      "Update one or more fields on a task. Pass null to clear an optional field. " +
      "Use statusLabel / groupLabel / stackLabel / sprintSlug for human-friendly references.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        statusId: { type: "string" },
        statusLabel: { type: "string" },
        groupId: { type: ["string", "null"] },
        groupLabel: { type: ["string", "null"] },
        stackId: { type: ["string", "null"] },
        stackLabel: { type: ["string", "null"] },
        sprintId: { type: ["string", "null"] },
        sprintSlug: { type: ["string", "null"] },
        dueDate: { type: ["string", "null"] },
        plannedDate: { type: ["string", "null"] },
        estimatedHours: { type: ["number", "null"] },
        loggedHours: { type: ["number", "null"] },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      const statusId = await resolveStatusId(input);
      if (statusId !== undefined) data.statusId = statusId;
      const groupId = await resolveGroupId(input);
      if (groupId !== undefined) data.groupId = groupId;
      const stackId = await resolveStackId(input);
      if (stackId !== undefined) data.stackId = stackId;
      const sprintId = await resolveSprintId(input);
      if (sprintId !== undefined) data.sprintId = sprintId;
      if (input.dueDate !== undefined) data.dueDate = parseDate(input.dueDate);
      if (input.plannedDate !== undefined) data.plannedDate = parseDate(input.plannedDate);
      if (input.estimatedHours !== undefined) data.estimatedHours = input.estimatedHours;
      if (input.loggedHours !== undefined) data.loggedHours = input.loggedHours;
      if (input.priority !== undefined) data.priority = input.priority;

      const task = await db.task.update({ where: { id: input.id }, data, select: taskSelect });
      return task;
    },
  },

  {
    name: "delete_task",
    description: "Hard-delete a task. Use archive_task if you want to keep history.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      await db.task.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "archive_task",
    description: "Soft-archive a task (sets archivedAt). It disappears from the kanban but stays queryable.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      const t = await db.task.update({ where: { id }, data: { archivedAt: new Date() }, select: taskSelect });
      return t;
    },
  },

  {
    name: "unarchive_task",
    description: "Clear archivedAt — task returns to the kanban.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      const t = await db.task.update({ where: { id }, data: { archivedAt: null }, select: taskSelect });
      return t;
    },
  },

  {
    name: "move_task",
    description:
      "Move a task to a different status / sprint and/or set its position in the column. " +
      "If `order` is omitted, the task is appended to the end of the destination column.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        statusId: { type: "string" },
        statusLabel: { type: "string" },
        sprintId: { type: ["string", "null"] },
        sprintSlug: { type: ["string", "null"] },
        order: { type: "integer" },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = moveSchema.parse(args);
      const current = await db.task.findUnique({
        where: { id: input.id },
        select: { statusId: true, sprintId: true },
      });
      if (!current) throw new Error(`Task not found: ${input.id}`);

      const newStatusId = (await resolveStatusId(input)) ?? current.statusId;
      const newSprintId =
        input.sprintId === null || input.sprintSlug === null
          ? null
          : input.sprintId || input.sprintSlug
          ? (await resolveSprintId(input)) ?? null
          : current.sprintId;
      const newOrder = input.order ?? (await nextOrderInColumn(newStatusId, newSprintId));

      const t = await db.task.update({
        where: { id: input.id },
        data: { statusId: newStatusId, sprintId: newSprintId, order: newOrder },
        select: taskSelect,
      });
      return t;
    },
  },

  {
    name: "assign_task",
    description: "Add an assignee to a task (by user email). No-op if already assigned.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, email: { type: "string", format: "email" } },
      required: ["id", "email"],
    },
    handler: async (args) => {
      const { id, email } = z
        .object({ id: z.string().min(1), email: z.string().email() })
        .parse(args);
      const userId = await resolveUserId(email);
      await db.taskAssignee.upsert({
        where: { taskId_userId: { taskId: id, userId } },
        create: { taskId: id, userId },
        update: {},
      });
      return db.task.findUnique({ where: { id }, select: taskSelect });
    },
  },

  {
    name: "unassign_task",
    description: "Remove an assignee from a task.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, email: { type: "string", format: "email" } },
      required: ["id", "email"],
    },
    handler: async (args) => {
      const { id, email } = z
        .object({ id: z.string().min(1), email: z.string().email() })
        .parse(args);
      const userId = await resolveUserId(email);
      await db.taskAssignee.deleteMany({ where: { taskId: id, userId } });
      return db.task.findUnique({ where: { id }, select: taskSelect });
    },
  },

  {
    name: "block_task",
    description:
      "Mark `blockerId` as a prerequisite for `blockedId`. No-op if the block already exists.",
    inputSchema: {
      type: "object",
      properties: {
        blockerId: { type: "string", description: "The task that must finish first." },
        blockedId: { type: "string", description: "The task that's waiting." },
      },
      required: ["blockerId", "blockedId"],
    },
    handler: async (args) => {
      const { blockerId, blockedId } = z
        .object({ blockerId: z.string().min(1), blockedId: z.string().min(1) })
        .parse(args);
      if (blockerId === blockedId) throw new Error("A task cannot block itself.");
      await db.taskBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      });
      return { ok: true, blockerId, blockedId };
    },
  },

  {
    name: "unblock_task",
    description: "Remove a blocker relationship.",
    inputSchema: {
      type: "object",
      properties: { blockerId: { type: "string" }, blockedId: { type: "string" } },
      required: ["blockerId", "blockedId"],
    },
    handler: async (args) => {
      const { blockerId, blockedId } = z
        .object({ blockerId: z.string().min(1), blockedId: z.string().min(1) })
        .parse(args);
      await db.taskBlock.deleteMany({ where: { blockerId, blockedId } });
      return { ok: true, blockerId, blockedId };
    },
  },

  {
    name: "log_task_hours",
    description: "Increment loggedHours by the given amount (can be negative to correct).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        hours: { type: "number", description: "Hours to add. Can be negative." },
      },
      required: ["id", "hours"],
    },
    handler: async (args) => {
      const { id, hours } = z
        .object({ id: z.string().min(1), hours: z.number() })
        .parse(args);
      const t = await db.task.update({
        where: { id },
        data: { loggedHours: { increment: hours } },
        select: taskSelect,
      });
      return t;
    },
  },

  {
    name: "list_tasks",
    description: "List tasks with optional filters. Default excludes archived. Default limit 100.",
    inputSchema: {
      type: "object",
      properties: {
        sprintId: { type: "string" },
        sprintSlug: { type: "string" },
        statusId: { type: "string" },
        statusLabel: { type: "string" },
        groupLabel: { type: "string" },
        stackLabel: { type: "string" },
        assigneeEmail: { type: "string", format: "email" },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        archived: { type: "boolean", description: "Include archived. Default false." },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        offset: { type: "integer", minimum: 0 },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const where: Record<string, unknown> = {};
      if (input.archived !== true) where.archivedAt = null;
      const sprintId = await resolveSprintId(input);
      if (sprintId !== undefined) where.sprintId = sprintId;
      const statusId = await resolveStatusId(input);
      if (statusId !== undefined) where.statusId = statusId;
      if (input.groupLabel) where.group = { label: input.groupLabel };
      if (input.stackLabel) where.stack = { label: input.stackLabel };
      if (input.assigneeEmail)
        where.assignees = { some: { user: { email: input.assigneeEmail.toLowerCase() } } };
      if (input.priority) where.priority = input.priority;

      const tasks = await db.task.findMany({
        where,
        orderBy: [{ statusId: "asc" }, { order: "asc" }],
        take: input.limit ?? 100,
        skip: input.offset ?? 0,
        select: taskSelect,
      });
      return { tasks, count: tasks.length };
    },
  },

  {
    name: "get_task",
    description: "Fetch one task by id or slug, with assignees and blockers.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" } },
    },
    handler: async (args) => {
      const { id, slug } = z
        .object({ id: z.string().optional(), slug: z.string().optional() })
        .parse(args);
      if (!id && !slug) throw new Error("Provide `id` or `slug`.");
      const task = await db.task.findFirst({
        where: id ? { id } : { slug: slug! },
        select: taskSelect,
      });
      if (!task) throw new Error(`Task not found: ${id ?? slug}`);
      return task;
    },
  },

  {
    name: "search_tasks",
    description: "Free-text search across task name, description, and slug. Case-insensitive.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = z
        .object({ query: z.string().min(1), limit: z.number().int().min(1).max(200).optional() })
        .parse(args);
      const q = { contains: query, mode: "insensitive" as const };
      const tasks = await db.task.findMany({
        where: { OR: [{ name: q }, { description: q }, { slug: q }] },
        orderBy: { updatedAt: "desc" },
        take: limit ?? 50,
        select: taskSelect,
      });
      return { tasks, count: tasks.length };
    },
  },
];
