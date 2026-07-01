import { z } from "zod";

import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import { computeSprintDates, defaultPlanningDate } from "@/lib/sprint-dates";

import { isoDate, parseDate } from "./_shared";
import type { ToolDef } from "./types";

const stateEnum = z.enum(["PLANNED", "ACTIVE", "CLOSED"]);

const createSchema = z.object({
  name: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate.optional(),
  planningDate: isoDate.optional(),
  testingDay1: isoDate.optional(),
  testingDay2: isoDate.optional(),
  testingDay3: isoDate.optional(),
  state: stateEnum.optional(),
  goal: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  planningDate: isoDate.nullable().optional(),
  testingDay1: isoDate.nullable().optional(),
  testingDay2: isoDate.nullable().optional(),
  testingDay3: isoDate.nullable().optional(),
  state: stateEnum.optional(),
  goal: z.string().nullable().optional(),
  retroNotes: z.string().nullable().optional(),
});

const sprintSelect = {
  id: true,
  name: true,
  slug: true,
  state: true,
  startDate: true,
  endDate: true,
  planningDate: true,
  testingDay1: true,
  testingDay2: true,
  testingDay3: true,
  goal: true,
  retroNotes: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} as const;

export const SPRINT_TOOLS: ToolDef[] = [
  {
    name: "create_sprint",
    description:
      "Create a two-week sprint. If endDate / testingDay1..3 / planningDate are omitted they're " +
      "computed from startDate (first Thursday + next-week Wed & Fri convention; planning = previous Monday).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        startDate: { type: "string", description: "ISO date (YYYY-MM-DD or full ISO)." },
        endDate: { type: "string" },
        planningDate: { type: "string" },
        testingDay1: { type: "string" },
        testingDay2: { type: "string" },
        testingDay3: { type: "string" },
        state: { type: "string", enum: ["PLANNED", "ACTIVE", "CLOSED"] },
        goal: { type: "string" },
      },
      required: ["name", "startDate"],
    },
    handler: async (args) => {
      const input = createSchema.parse(args);
      const startDate = parseDate(input.startDate)!;
      const computed = computeSprintDates(startDate);

      const slug = await uniqueSlug(slugify(input.name), async (s) =>
        Boolean(await db.sprint.findUnique({ where: { slug: s }, select: { id: true } })),
      );

      const sprint = await db.sprint.create({
        data: {
          name: input.name,
          slug,
          startDate,
          endDate: parseDate(input.endDate) ?? computed.endDate,
          planningDate: parseDate(input.planningDate) ?? defaultPlanningDate(startDate),
          testingDay1: parseDate(input.testingDay1) ?? computed.testingDay1,
          testingDay2: parseDate(input.testingDay2) ?? computed.testingDay2,
          testingDay3: parseDate(input.testingDay3) ?? computed.testingDay3,
          state: input.state ?? "PLANNED",
          goal: input.goal ?? null,
        },
        select: sprintSelect,
      });
      return sprint;
    },
  },

  {
    name: "update_sprint",
    description: "Update sprint fields. Pass null on nullable fields to clear them.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        planningDate: { type: ["string", "null"] },
        testingDay1: { type: ["string", "null"] },
        testingDay2: { type: ["string", "null"] },
        testingDay3: { type: ["string", "null"] },
        state: { type: "string", enum: ["PLANNED", "ACTIVE", "CLOSED"] },
        goal: { type: ["string", "null"] },
        retroNotes: { type: ["string", "null"] },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.startDate !== undefined) data.startDate = parseDate(input.startDate);
      if (input.endDate !== undefined) data.endDate = parseDate(input.endDate);
      if (input.planningDate !== undefined) data.planningDate = parseDate(input.planningDate);
      if (input.testingDay1 !== undefined) data.testingDay1 = parseDate(input.testingDay1);
      if (input.testingDay2 !== undefined) data.testingDay2 = parseDate(input.testingDay2);
      if (input.testingDay3 !== undefined) data.testingDay3 = parseDate(input.testingDay3);
      if (input.state !== undefined) data.state = input.state;
      if (input.goal !== undefined) data.goal = input.goal;
      if (input.retroNotes !== undefined) data.retroNotes = input.retroNotes;
      const sprint = await db.sprint.update({ where: { id: input.id }, data, select: sprintSelect });
      return sprint;
    },
  },

  {
    name: "close_sprint",
    description:
      "Mark a sprint CLOSED. Optionally accepts retroNotes to persist a sprint-close reflection. " +
      "This does not delete the sprint or its tasks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        retroNotes: { type: "string", description: "Free-form sprint retro / learnings." },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const { id, retroNotes } = z
        .object({ id: z.string().min(1), retroNotes: z.string().optional() })
        .parse(args);
      const sprint = await db.sprint.update({
        where: { id },
        data: {
          state: "CLOSED",
          closedAt: new Date(),
          retroNotes: retroNotes ?? undefined,
        },
        select: sprintSelect,
      });
      return sprint;
    },
  },

  {
    name: "delete_sprint",
    description:
      "Delete a sprint. Tasks are detached (sprintId → null, returned to backlog) before the sprint is deleted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      await db.$transaction([
        db.task.updateMany({ where: { sprintId: id }, data: { sprintId: null } }),
        db.sprint.delete({ where: { id } }),
      ]);
      return { ok: true, id };
    },
  },

  {
    name: "list_sprints",
    description: "List sprints, default sort by startDate desc. Optional state filter.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["PLANNED", "ACTIVE", "CLOSED"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const { state, limit } = z
        .object({ state: stateEnum.optional(), limit: z.number().int().min(1).max(200).optional() })
        .parse(args);
      const where: Record<string, unknown> = {};
      if (state) where.state = state;
      const sprints = await db.sprint.findMany({
        where,
        orderBy: { startDate: "desc" },
        take: limit ?? 50,
        select: sprintSelect,
      });
      return { sprints, count: sprints.length };
    },
  },

  {
    name: "get_sprint",
    description:
      "Fetch a sprint by id or slug, including its tasks grouped by status (kanban shape).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" } },
    },
    handler: async (args) => {
      const { id, slug } = z
        .object({ id: z.string().optional(), slug: z.string().optional() })
        .parse(args);
      if (!id && !slug) throw new Error("Provide `id` or `slug`.");
      const sprint = await db.sprint.findFirst({
        where: id ? { id } : { slug: slug! },
        include: {
          tasks: {
            where: { archivedAt: null },
            orderBy: [{ statusId: "asc" }, { order: "asc" }],
            include: {
              status: { select: { id: true, label: true, color: true, isDone: true } },
              assignees: { include: { user: { select: { id: true, email: true, name: true } } } },
            },
          },
        },
      });
      if (!sprint) throw new Error(`Sprint not found: ${id ?? slug}`);
      return sprint;
    },
  },
];
