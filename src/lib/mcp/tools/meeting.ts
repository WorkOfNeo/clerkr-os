import { z } from "zod";

import { semanticSearchMeetings } from "@/lib/ai/embed-entities";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { runStructurePipeline } from "@/lib/meetings/structure";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

const MEETING_KINDS = ["INTERNAL", "CUSTOMER", "PROSPECT"] as const;
const SIGNAL_STATUSES = ["NEW", "ALREADY_TRACKED", "SMALL_UNIQUE"] as const;

const createSchema = z.object({
  title: z.string().min(1),
  transcript: z.string().min(1),
  kind: z.enum(MEETING_KINDS).optional(),
  meetingDate: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  structure: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  transcript: z.string().min(1).optional(),
  kind: z.enum(MEETING_KINDS).optional(),
  meetingDate: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

const listSchema = z.object({
  kind: z.enum(MEETING_KINDS).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const meetingListSelect = {
  id: true,
  slug: true,
  title: true,
  kind: true,
  meetingDate: true,
  attendees: true,
  tldr: true,
  structuredAt: true,
  createdAt: true,
  author: { select: { id: true, email: true, name: true } },
} as const;

const meetingFullSelect = {
  ...meetingListSelect,
  transcript: true,
  decisions: { select: { id: true, content: true, owner: true } },
  featureSignals: {
    select: {
      id: true,
      title: true,
      detail: true,
      status: true,
      tags: true,
      featureId: true,
      feature: { select: { id: true, slug: true, title: true, status: true } },
    },
  },
  actionItems: {
    select: {
      id: true,
      content: true,
      assignee: true,
      dueDate: true,
      done: true,
      taskId: true,
    },
  },
  openQuestions: { select: { id: true, content: true, resolved: true } },
} as const;

async function tryStructure(meetingId: string): Promise<{ structured: boolean; error?: string }> {
  if (!isOpenAIAvailable()) {
    return { structured: false, error: "OPENAI_API_KEY not set — brief extraction skipped." };
  }
  try {
    await runStructurePipeline(meetingId);
    return { structured: true };
  } catch (err) {
    return { structured: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const MEETING_TOOLS: ToolDef[] = [
  {
    name: "create_meeting",
    description:
      "Ingest meeting notes / a transcript as a new Meeting. By default it is immediately " +
      "structured with AI: tldr + decisions + feature signals + action items + open questions " +
      "are extracted, the meeting is embedded for semantic recall, and every feature signal is " +
      "auto-clustered and deduped against the Feature Library (matching signals link to the " +
      "existing feature; new ones are auto-promoted). This is the main entry point for " +
      "'here are my notes from a meeting — categorize them'. Pass structure=false to just " +
      "store the raw notes.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Meeting title, e.g. 'Status meeting with Mads'." },
        transcript: { type: "string", description: "Raw notes / transcript. Markdown is fine." },
        kind: {
          type: "string",
          enum: ["INTERNAL", "CUSTOMER", "PROSPECT"],
          description: "Default INTERNAL. Use CUSTOMER for user/customer meetings.",
        },
        meetingDate: { type: "string", description: "ISO date (YYYY-MM-DD). Defaults to today." },
        attendees: { type: "array", items: { type: "string" } },
        structure: {
          type: "boolean",
          description: "Run AI brief extraction + enrichment immediately. Default true.",
        },
      },
      required: ["title", "transcript"],
    },
    handler: async (args, ctx) => {
      const input = createSchema.parse(args);
      const slug = await uniqueSlug(slugify(input.title), async (c) =>
        Boolean(await db.meeting.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const meeting = await db.meeting.create({
        data: {
          slug,
          title: input.title.trim(),
          kind: input.kind ?? "INTERNAL",
          meetingDate: parseDate(input.meetingDate) ?? new Date(),
          attendees: input.attendees ?? [],
          transcript: input.transcript,
          authorId: ctx.userId,
        },
        select: { id: true },
      });

      let structureResult: { structured: boolean; error?: string } = { structured: false };
      if (input.structure !== false) {
        structureResult = await tryStructure(meeting.id);
      }

      const full = await db.meeting.findUnique({
        where: { id: meeting.id },
        select: meetingFullSelect,
      });
      return { ...full, ...structureResult };
    },
  },

  {
    name: "structure_meeting",
    description:
      "(Re-)run AI brief extraction + enrichment on an existing meeting. Replaces the previous " +
      "extraction (decisions, signals, action items, open questions) with a fresh one.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      if (!isOpenAIAvailable()) {
        throw new Error("OPENAI_API_KEY is not set. Brief extraction is disabled.");
      }
      const result = await runStructurePipeline(id);
      const full = await db.meeting.findUnique({ where: { id }, select: meetingFullSelect });
      return { ...full, extraction: result };
    },
  },

  {
    name: "list_meetings",
    description: "List meetings, newest meeting date first. Optional kind filter.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["INTERNAL", "CUSTOMER", "PROSPECT"] },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 20" },
        offset: { type: "integer", minimum: 0 },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const meetings = await db.meeting.findMany({
        where: input.kind ? { kind: input.kind } : undefined,
        orderBy: { meetingDate: "desc" },
        take: input.limit ?? 20,
        skip: input.offset ?? 0,
        select: meetingListSelect,
      });
      return { meetings, count: meetings.length };
    },
  },

  {
    name: "get_meeting",
    description:
      "Fetch one meeting by id or slug, including the full transcript and the extracted brief " +
      "(decisions, feature signals with their linked features, action items, open questions).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Meeting id (uuid) or slug." },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const meeting = await db.meeting.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        select: meetingFullSelect,
      });
      if (!meeting) throw new Error(`Meeting not found: ${id}`);
      return meeting;
    },
  },

  {
    name: "search_meetings",
    description:
      "Semantic search across meetings (title + tldr + transcript embeddings). Falls back to " +
      "case-insensitive text match when OpenAI is unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = z
        .object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).optional() })
        .parse(args);
      if (isOpenAIAvailable()) {
        const hits = await semanticSearchMeetings(query, limit ?? 6);
        return { hits, mode: "semantic" };
      }
      const q = { contains: query, mode: "insensitive" as const };
      const meetings = await db.meeting.findMany({
        where: { OR: [{ title: q }, { tldr: q }, { transcript: q }] },
        orderBy: { meetingDate: "desc" },
        take: limit ?? 6,
        select: meetingListSelect,
      });
      return { hits: meetings, mode: "text" };
    },
  },

  {
    name: "update_meeting",
    description:
      "Update meeting metadata or transcript. Editing the transcript does NOT re-extract " +
      "automatically — call structure_meeting afterwards if you want a fresh brief.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        transcript: { type: "string" },
        kind: { type: "string", enum: ["INTERNAL", "CUSTOMER", "PROSPECT"] },
        meetingDate: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.transcript !== undefined) data.transcript = input.transcript;
      if (input.kind !== undefined) data.kind = input.kind;
      if (input.attendees !== undefined) data.attendees = input.attendees;
      if (input.meetingDate !== undefined) {
        const d = parseDate(input.meetingDate);
        if (!d) throw new Error(`Invalid date: ${input.meetingDate}`);
        data.meetingDate = d;
      }
      const meeting = await db.meeting.update({
        where: { id: input.id },
        data,
        select: meetingListSelect,
      });
      return meeting;
    },
  },

  {
    name: "delete_meeting",
    description:
      "Delete a meeting and its extracted brief (decisions, signals, action items, open " +
      "questions cascade). Features promoted from its signals stay in the library.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      await db.meeting.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "update_feature_signal",
    description:
      "Reclassify a meeting feature signal: NEW (fresh idea), ALREADY_TRACKED (matches an " +
      "existing capability), or SMALL_UNIQUE (niche one-off worth keeping).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["NEW", "ALREADY_TRACKED", "SMALL_UNIQUE"] },
      },
      required: ["id", "status"],
    },
    handler: async (args) => {
      const input = z
        .object({ id: z.string().min(1), status: z.enum(SIGNAL_STATUSES) })
        .parse(args);
      const signal = await db.featureSignal.update({
        where: { id: input.id },
        data: { status: input.status },
        select: { id: true, title: true, status: true, meetingId: true, featureId: true },
      });
      return signal;
    },
  },

  {
    name: "toggle_action_item",
    description: "Mark a meeting action item done / not done.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["id", "done"],
    },
    handler: async (args) => {
      const input = z.object({ id: z.string().min(1), done: z.boolean() }).parse(args);
      const item = await db.actionItem.update({
        where: { id: input.id },
        data: { done: input.done },
        select: { id: true, content: true, done: true, meetingId: true },
      });
      return item;
    },
  },

  {
    name: "resolve_open_question",
    description: "Mark a meeting open question resolved / unresolved.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        resolved: { type: "boolean" },
      },
      required: ["id", "resolved"],
    },
    handler: async (args) => {
      const input = z.object({ id: z.string().min(1), resolved: z.boolean() }).parse(args);
      const question = await db.openQuestion.update({
        where: { id: input.id },
        data: { resolved: input.resolved },
        select: { id: true, content: true, resolved: true, meetingId: true },
      });
      return question;
    },
  },

  {
    name: "send_action_item_to_task",
    description:
      "Push a meeting action item onto the task board (1:1 — idempotent, returns the existing " +
      "task if already pushed). The task lands in the first status column of the backlog.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      const { id } = idSchema.parse(args);
      const item = await db.actionItem.findUnique({ where: { id } });
      if (!item) throw new Error(`Action item not found: ${id}`);

      if (item.taskId) {
        const existing = await db.task.findUnique({
          where: { id: item.taskId },
          select: { id: true, slug: true, name: true },
        });
        if (existing) return { ...existing, alreadyExisted: true };
      }

      const status = await db.taskStatus.findFirst({ orderBy: { sortOrder: "asc" } });
      if (!status) throw new Error("No task statuses configured yet — run npm run db:seed first.");

      const slug = await uniqueSlug(slugify(item.content), async (s) =>
        Boolean(await db.task.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const last = await db.task.findFirst({
        where: { statusId: status.id, sprintId: null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const order = (last?.order ?? 0) + 1000;

      const task = await db.task.create({
        data: {
          name: item.content,
          slug,
          statusId: status.id,
          dueDate: item.dueDate,
          order,
          authorId: ctx.userId,
          sourceMeetingId: item.meetingId,
        },
        select: { id: true, slug: true, name: true },
      });
      await db.actionItem.update({ where: { id: item.id }, data: { taskId: task.id } });
      return { ...task, alreadyExisted: false };
    },
  },
];
