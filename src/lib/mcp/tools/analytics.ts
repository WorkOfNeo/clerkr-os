import { z } from "zod";

import { db } from "@/lib/db";

import type { ToolDef } from "./types";

const sprintRefSchema = z
  .object({
    sprintId: z.string().optional(),
    sprintSlug: z.string().optional(),
  })
  .refine((v) => v.sprintId || v.sprintSlug, { message: "Provide sprintId or sprintSlug." });

async function findSprint(input: { sprintId?: string; sprintSlug?: string }) {
  const sprint = await db.sprint.findFirst({
    where: input.sprintId ? { id: input.sprintId } : { slug: input.sprintSlug! },
  });
  if (!sprint) throw new Error(`Sprint not found: ${input.sprintId ?? input.sprintSlug}`);
  return sprint;
}

export const ANALYTICS_TOOLS: ToolDef[] = [
  {
    name: "sprint_summary",
    description:
      "Counts and hours roll-up for a sprint: tasks per status, total estimated vs logged hours, " +
      "blocker count, and overdue tasks.",
    inputSchema: {
      type: "object",
      properties: {
        sprintId: { type: "string" },
        sprintSlug: { type: "string" },
      },
    },
    handler: async (args) => {
      const input = sprintRefSchema.parse(args);
      const sprint = await findSprint(input);

      const tasks = await db.task.findMany({
        where: { sprintId: sprint.id, archivedAt: null },
        include: { status: true, blockedBy: { select: { blockerId: true } } },
      });

      const byStatus: Record<string, { label: string; color: string; isDone: boolean; count: number }> = {};
      let estimated = 0;
      let logged = 0;
      let blocked = 0;
      let overdue = 0;
      const now = new Date();

      for (const t of tasks) {
        const k = t.status.label;
        if (!byStatus[k])
          byStatus[k] = { label: t.status.label, color: t.status.color, isDone: t.status.isDone, count: 0 };
        byStatus[k].count++;
        if (t.estimatedHours) estimated += Number(t.estimatedHours);
        if (t.loggedHours) logged += Number(t.loggedHours);
        if (t.blockedBy.length > 0 && !t.status.isDone) blocked++;
        if (t.dueDate && t.dueDate < now && !t.status.isDone) overdue++;
      }

      return {
        sprint: { id: sprint.id, slug: sprint.slug, name: sprint.name, state: sprint.state },
        taskCount: tasks.length,
        byStatus: Object.values(byStatus),
        estimatedHours: estimated,
        loggedHours: logged,
        blockedCount: blocked,
        overdueCount: overdue,
      };
    },
  },

  {
    name: "sprint_burndown",
    description:
      "Per-day count of tasks not yet in a Done status from sprint.startDate to today (or sprint.endDate, whichever is earlier).",
    inputSchema: {
      type: "object",
      properties: { sprintId: { type: "string" }, sprintSlug: { type: "string" } },
    },
    handler: async (args) => {
      const input = sprintRefSchema.parse(args);
      const sprint = await findSprint(input);
      const tasks = await db.task.findMany({
        where: { sprintId: sprint.id, archivedAt: null },
        include: { status: true },
      });

      const start = new Date(sprint.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(Math.min(sprint.endDate.getTime(), Date.now()));
      end.setHours(0, 0, 0, 0);

      const days: { date: string; remaining: number; total: number }[] = [];
      for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000) {
        const dayEnd = new Date(t);
        dayEnd.setHours(23, 59, 59, 999);
        let remaining = 0;
        let total = 0;
        for (const task of tasks) {
          if (task.createdAt > dayEnd) continue; // didn't exist yet
          total++;
          // A task counts as "remaining" if it isn't Done as of this day —
          // we approximate by checking current status (we don't store history)
          // but discount tasks created after the day.
          if (!task.status.isDone) remaining++;
        }
        days.push({ date: dayEnd.toISOString().slice(0, 10), remaining, total });
      }

      return {
        sprint: { id: sprint.id, slug: sprint.slug, name: sprint.name },
        days,
      };
    },
  },

  {
    name: "team_load",
    description: "Open tasks per assignee, optionally scoped to a sprint.",
    inputSchema: {
      type: "object",
      properties: { sprintId: { type: "string" }, sprintSlug: { type: "string" } },
    },
    handler: async (args) => {
      const { sprintId, sprintSlug } = z
        .object({ sprintId: z.string().optional(), sprintSlug: z.string().optional() })
        .parse(args);

      let sprintFilter: string | undefined;
      if (sprintId) sprintFilter = sprintId;
      else if (sprintSlug) {
        const s = await db.sprint.findUnique({ where: { slug: sprintSlug } });
        if (!s) throw new Error(`Sprint not found: ${sprintSlug}`);
        sprintFilter = s.id;
      }

      const assignees = await db.taskAssignee.findMany({
        where: {
          task: {
            archivedAt: null,
            status: { isDone: false },
            ...(sprintFilter ? { sprintId: sprintFilter } : {}),
          },
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
          task: {
            select: { estimatedHours: true, priority: true },
          },
        },
      });

      const byUser: Record<string, { user: { id: string; email: string; name: string }; openCount: number; estimatedHours: number; urgentCount: number }> = {};
      for (const a of assignees) {
        const key = a.user.id;
        if (!byUser[key]) {
          byUser[key] = { user: a.user, openCount: 0, estimatedHours: 0, urgentCount: 0 };
        }
        byUser[key].openCount++;
        if (a.task.estimatedHours) byUser[key].estimatedHours += Number(a.task.estimatedHours);
        if (a.task.priority === "URGENT") byUser[key].urgentCount++;
      }

      return { rows: Object.values(byUser).sort((a, b) => b.openCount - a.openCount) };
    },
  },

  {
    name: "overdue_tasks",
    description: "Tasks past their dueDate and not in a Done status. Optionally scoped to a sprint.",
    inputSchema: {
      type: "object",
      properties: {
        sprintId: { type: "string" },
        sprintSlug: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const { sprintId, sprintSlug, limit } = z
        .object({
          sprintId: z.string().optional(),
          sprintSlug: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);

      let sprintFilter: string | undefined;
      if (sprintId) sprintFilter = sprintId;
      else if (sprintSlug) {
        const s = await db.sprint.findUnique({ where: { slug: sprintSlug } });
        if (!s) throw new Error(`Sprint not found: ${sprintSlug}`);
        sprintFilter = s.id;
      }

      const tasks = await db.task.findMany({
        where: {
          archivedAt: null,
          dueDate: { lt: new Date() },
          status: { isDone: false },
          ...(sprintFilter ? { sprintId: sprintFilter } : {}),
        },
        orderBy: { dueDate: "asc" },
        take: limit ?? 50,
        include: {
          status: { select: { label: true } },
          assignees: { include: { user: { select: { email: true, name: true } } } },
        },
      });
      return { tasks, count: tasks.length };
    },
  },

  {
    name: "task_throughput",
    description:
      "Number of tasks closed (status.isDone = true) per closed sprint, oldest first. Useful for trend lines.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const sprints = await db.sprint.findMany({
        where: { state: "CLOSED" },
        orderBy: { startDate: "asc" },
        include: {
          tasks: { include: { status: true } },
        },
      });

      const rows = sprints.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        completed: s.tasks.filter((t) => t.status.isDone).length,
        total: s.tasks.length,
      }));
      return { rows };
    },
  },
];
