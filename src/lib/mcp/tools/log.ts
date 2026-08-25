import { z } from "zod";

import { semanticSearchLog } from "@/lib/ai/embed-entities";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { entrySelect, resolveThread, writeLogEntry } from "@/lib/log";
import { LOG_KINDS, LOG_KIND_ORDER } from "@/lib/log-kinds";

import { isoDate, parseDate } from "./_shared";
import type { ToolDef } from "./types";

// Work-log tools. `log_entry` is the one that matters: it is how Claude writes
// a decision, dead end, blocker or idea into Clerkr OS *during* a session,
// instead of relying on the session-end hook to reconstruct it afterwards.

const kindEnum = z.enum(LOG_KIND_ORDER as [string, ...string[]]);
const kindDescription = LOG_KIND_ORDER.map((k) => `${k} (${LOG_KINDS[k].hint})`).join("; ");

const logSchema = z.object({
  body: z.string().min(1),
  kind: kindEnum.optional(),
  thread: z.string().optional(),
  occurredAt: isoDate.optional(),
});

const listSchema = z.object({
  kind: kindEnum.optional(),
  thread: z.string().optional(),
  unreviewedOnly: z.boolean().optional(),
  since: isoDate.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1).optional(),
  kind: kindEnum.optional(),
  thread: z.string().nullable().optional(),
  reviewed: z.boolean().optional(),
});

export const LOG_TOOLS: ToolDef[] = [
  {
    name: "log_entry",
    description:
      "Write one entry to the Clerkr OS work log. Use this the moment something durable happens: a call the user made, a path that worked, a path that turned out wrong (and why), something blocking progress, or an idea for later. One entry per thing — keep each body self-contained so it reads correctly in six months with no other context. Kinds: " +
      kindDescription,
    inputSchema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "The entry itself. Self-contained; state the what and the why.",
        },
        kind: { type: "string", enum: LOG_KIND_ORDER, description: kindDescription },
        thread: {
          type: "string",
          description:
            "Thread id or slug to file this under. Omit to leave it unfiled — it can be filed later from /log.",
        },
        occurredAt: {
          type: "string",
          description: "ISO date/time this happened. Defaults to now.",
        },
      },
      required: ["body"],
    },
    handler: async (args, ctx) => {
      const input = logSchema.parse(args);
      const thread = input.thread ? await resolveThread(input.thread) : null;
      const entry = await writeLogEntry({
        body: input.body,
        kind: (input.kind ?? "NOTE") as never,
        threadId: thread?.id ?? null,
        source: "MCP",
        // Written deliberately during a session with the user present — no
        // review tray. The session-end hook's guesses are what need reviewing.
        reviewed: true,
        occurredAt: parseDate(input.occurredAt) ?? undefined,
        authorId: ctx.userId,
      });
      return {
        id: entry.id,
        kind: entry.kind,
        thread: thread ? { id: thread.id, slug: thread.slug, title: thread.title } : null,
        occurredAt: entry.occurredAt,
      };
    },
  },
  {
    name: "list_log",
    description:
      "List work-log entries, newest first. Filter by kind, thread, or date. Use DEAD_END before suggesting an approach — it's the fastest way to find out something has already been tried and failed.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: LOG_KIND_ORDER },
        thread: { type: "string", description: "Thread id or slug." },
        unreviewedOnly: {
          type: "boolean",
          description: "Only entries captured automatically and not yet confirmed.",
        },
        since: { type: "string", description: "ISO date — only entries on or after this." },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const thread = input.thread ? await resolveThread(input.thread) : null;
      const since = parseDate(input.since);
      const entries = await db.logEntry.findMany({
        where: {
          ...(input.kind ? { kind: input.kind as never } : {}),
          ...(thread ? { threadId: thread.id } : {}),
          ...(input.unreviewedOnly ? { reviewed: false } : {}),
          ...(since ? { occurredAt: { gte: since } } : {}),
        },
        orderBy: { occurredAt: "desc" },
        take: input.limit ?? 50,
        select: entrySelect,
      });
      return { entries, count: entries.length };
    },
  },
  {
    name: "search_log",
    description:
      "Semantic search across the work log — finds entries by meaning, not keywords. Ask it 'have we tried X?' or 'why did we pick Y?' before re-deriving an answer.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = searchSchema.parse(args);
      if (!isOpenAIAvailable()) {
        // Degrade to substring matching rather than failing the call.
        const entries = await db.logEntry.findMany({
          where: { body: { contains: query, mode: "insensitive" } },
          orderBy: { occurredAt: "desc" },
          take: limit ?? 10,
          select: entrySelect,
        });
        return { entries, count: entries.length, mode: "keyword (OpenAI not configured)" };
      }
      const hits = await semanticSearchLog(query, limit ?? 10);
      return { entries: hits, count: hits.length, mode: "semantic" };
    },
  },
  {
    name: "update_log_entry",
    description:
      "Edit a work-log entry — fix its wording, change its kind, file it onto a thread, or mark an auto-captured entry as reviewed. Pass thread: null to unfile it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        body: { type: "string" },
        kind: { type: "string", enum: LOG_KIND_ORDER },
        thread: { type: ["string", "null"], description: "Thread id or slug, or null to unfile." },
        reviewed: { type: "boolean" },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      let threadId: string | null | undefined;
      if (input.thread === null) threadId = null;
      else if (input.thread) threadId = (await resolveThread(input.thread)).id;

      const entry = await db.logEntry.update({
        where: { id: input.id },
        data: {
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.kind !== undefined ? { kind: input.kind as never } : {}),
          ...(threadId !== undefined ? { threadId } : {}),
          ...(input.reviewed !== undefined ? { reviewed: input.reviewed } : {}),
        },
        select: entrySelect,
      });

      if (input.body !== undefined && isOpenAIAvailable()) {
        try {
          const { embedLogEntry } = await import("@/lib/ai/embed-entities");
          await embedLogEntry(input.id, input.body);
        } catch (err) {
          console.warn("[mcp] re-embed failed:", err);
        }
      }
      return entry;
    },
  },
  {
    name: "delete_log_entry",
    description: "Permanently delete a work-log entry.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      await db.actionItem.updateMany({ where: { logEntryId: id }, data: { logEntryId: null } });
      await db.logEntry.delete({ where: { id } });
      return { deleted: true, id };
    },
  },
];
