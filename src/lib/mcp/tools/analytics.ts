import { z } from "zod";

import { db } from "@/lib/db";
import { entrySelect, threadListSelect } from "@/lib/log";

import type { ToolDef } from "./types";

// Analytics for a work log, not a sprint board. Nothing here measures
// throughput or velocity — with a team of one those numbers are noise. What is
// worth asking: what's stuck, what have I been doing, what did the work throw
// off that I haven't done anything with, and which threads have gone quiet.

const windowSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const ANALYTICS_TOOLS: ToolDef[] = [
  {
    name: "log_pulse",
    description:
      "What's been happening in the work log over the last N days (default 14): entry counts by kind, the most active threads, and how many auto-captured entries are still unreviewed. Use this to answer 'what have I been doing?'.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "Window. Default 14." },
      },
    },
    handler: async (args) => {
      const { days = 14 } = windowSchema.parse(args);
      const from = since(days);

      const [byKind, total, unreviewed, threads] = await Promise.all([
        db.logEntry.groupBy({
          by: ["kind"],
          where: { occurredAt: { gte: from } },
          _count: { _all: true },
        }),
        db.logEntry.count({ where: { occurredAt: { gte: from } } }),
        db.logEntry.count({ where: { reviewed: false } }),
        db.thread.findMany({
          where: { entries: { some: { occurredAt: { gte: from } } } },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            slug: true,
            title: true,
            state: true,
            _count: { select: { entries: true } },
          },
        }),
      ]);

      return {
        window: { days, since: from },
        total,
        byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count._all])),
        unreviewed,
        activeThreads: threads.map((t) => ({
          slug: t.slug,
          title: t.title,
          state: t.state,
          entries: t._count.entries,
        })),
      };
    },
  },
  {
    name: "open_blockers",
    description:
      "Everything currently in the way: BLOCKER and QUESTION entries on threads that are still open or parked, newest first. This is the closest thing to a to-do list here — it's derived from what actually happened, not planned up front.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
    handler: async (args) => {
      const { limit } = z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .parse(args);
      const entries = await db.logEntry.findMany({
        where: {
          kind: { in: ["BLOCKER", "QUESTION"] },
          OR: [{ thread: { state: { in: ["OPEN", "PARKED"] } } }, { threadId: null }],
        },
        orderBy: { occurredAt: "desc" },
        take: limit ?? 25,
        select: entrySelect,
      });
      return { entries, count: entries.length };
    },
  },
  {
    name: "idea_harvest",
    description:
      "IDEA entries that have not yet been carried into the Feature Library — the ideas the work threw off that nothing has been done with. Closing their thread promotes them automatically; this finds the ones sitting on threads that are still open.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
    handler: async (args) => {
      const { limit } = z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .parse(args);
      const entries = await db.logEntry.findMany({
        where: { kind: "IDEA", featureId: null },
        orderBy: { occurredAt: "desc" },
        take: limit ?? 50,
        select: entrySelect,
      });
      return { entries, count: entries.length };
    },
  },
  {
    name: "stale_threads",
    description:
      "Open or parked threads with no log entry in the last N days (default 14). These are the ones to either pick back up, park deliberately, or close and roll up — a thread that quietly went nowhere still has learnings in it.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "Default 14." },
      },
    },
    handler: async (args) => {
      const { days = 14 } = windowSchema.parse(args);
      const cutoff = since(days);
      const threads = await db.thread.findMany({
        where: {
          state: { in: ["OPEN", "PARKED"] },
          entries: { none: { occurredAt: { gte: cutoff } } },
        },
        orderBy: { updatedAt: "asc" },
        select: threadListSelect,
      });
      return {
        cutoff,
        threads: threads.map((t) => ({
          ...t,
          daysQuiet: Math.floor((Date.now() - t.updatedAt.getTime()) / 86_400_000),
        })),
        count: threads.length,
      };
    },
  },
  {
    name: "ingest_history",
    description:
      "What the Claude Code session-end hook has sent to Clerkr OS, newest first — including sessions it judged irrelevant and why. Use this to answer 'why didn't my session show up in the log?'.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        relevantOnly: { type: "boolean" },
      },
    },
    handler: async (args) => {
      const { limit, relevantOnly } = z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          relevantOnly: z.boolean().optional(),
        })
        .parse(args);
      const rows = await db.sessionIngest.findMany({
        where: relevantOnly ? { relevant: true } : {},
        orderBy: { createdAt: "desc" },
        take: limit ?? 25,
      });
      return { ingests: rows, count: rows.length };
    },
  },
];
