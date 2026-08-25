import { z } from "zod";

import { semanticSearchThreads } from "@/lib/ai/embed-entities";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { rollUpThread } from "@/lib/ai/roll-up-thread";
import { ensureCluster } from "@/lib/clusters";
import { db } from "@/lib/db";
import { createThread, resolveThread, threadListSelect, tryEmbedThread } from "@/lib/log";
import { THREAD_STATES, THREAD_STATE_ORDER } from "@/lib/log-kinds";

import type { ToolDef } from "./types";

// Threads are the spine of the work log: one per call the user has made. They
// replace sprints — there is no planning horizon here, only "this was decided,
// here's everything that happened while doing it, here's what came of it".

const stateEnum = z.enum(THREAD_STATE_ORDER as [string, ...string[]]);
const stateDescription = THREAD_STATE_ORDER.map(
  (s) => `${s} (${THREAD_STATES[s].label})`,
).join("; ");

const openSchema = z.object({
  title: z.string().min(1),
  decision: z.string().optional(),
  why: z.string().optional(),
  cluster: z.string().optional(),
});

const updateSchema = z.object({
  thread: z.string().min(1),
  title: z.string().min(1).optional(),
  decision: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
  state: stateEnum.optional(),
  cluster: z.string().nullable().optional(),
});

export const THREAD_TOOLS: ToolDef[] = [
  {
    name: "open_thread",
    description:
      "Open a thread in Clerkr OS — a line of work started by a decision the user has made. Use this when the user commits to doing something ('we're going to X'), then log entries against it as the work happens. Do not open a thread for a task someone merely suggested.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short name for the line of work, e.g. 'Case management in Clerkr'.",
        },
        decision: { type: "string", description: "The call, in one sentence." },
        why: { type: "string", description: "The reasoning behind the call." },
        cluster: {
          type: "string",
          description: "Product area, e.g. 'Case Management'. Reuse existing names.",
        },
      },
      required: ["title"],
    },
    handler: async (args, ctx) => {
      const input = openSchema.parse(args);
      const thread = await createThread({ ...input, authorId: ctx.userId });
      return { id: thread.id, slug: thread.slug, title: thread.title, state: thread.state };
    },
  },
  {
    name: "list_threads",
    description:
      "List threads in Clerkr OS with their entry counts. Call this before opening a new thread so related work joins an existing one instead of fragmenting.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: THREAD_STATE_ORDER, description: stateDescription },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const input = z
        .object({ state: stateEnum.optional(), limit: z.number().int().min(1).max(200).optional() })
        .parse(args);
      const threads = await db.thread.findMany({
        where: input.state ? { state: input.state as never } : {},
        orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
        take: input.limit ?? 50,
        select: threadListSelect,
      });
      return { threads, count: threads.length };
    },
  },
  {
    name: "get_thread",
    description:
      "Read one thread in full — the decision, its reasoning, every log entry in order, and the rolled-up outcome if it's closed.",
    inputSchema: {
      type: "object",
      properties: { thread: { type: "string", description: "Thread id or slug." } },
      required: ["thread"],
    },
    handler: async (args) => {
      const { thread: ref } = z.object({ thread: z.string().min(1) }).parse(args);
      const { id } = await resolveThread(ref);
      return db.thread.findUnique({
        where: { id },
        select: {
          ...threadListSelect,
          why: true,
          outcome: true,
          outcomeAt: true,
          entries: {
            orderBy: { occurredAt: "asc" },
            select: {
              id: true,
              kind: true,
              body: true,
              source: true,
              reviewed: true,
              occurredAt: true,
            },
          },
        },
      });
    },
  },
  {
    name: "search_threads",
    description:
      "Semantic search over threads — find the line of work a topic belongs to before logging against it.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = z
        .object({ query: z.string().min(1), limit: z.number().int().min(1).max(25).optional() })
        .parse(args);
      if (!isOpenAIAvailable()) {
        const threads = await db.thread.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { decision: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 8,
          select: threadListSelect,
        });
        return { threads, count: threads.length, mode: "keyword (OpenAI not configured)" };
      }
      const hits = await semanticSearchThreads(query, limit ?? 8);
      return { threads: hits, count: hits.length, mode: "semantic" };
    },
  },
  {
    name: "update_thread",
    description:
      "Edit a thread's title, decision, reasoning, product area or state. Changing state to DONE or ABANDONED here just marks it — use close_thread to also get the AI roll-up.",
    inputSchema: {
      type: "object",
      properties: {
        thread: { type: "string", description: "Thread id or slug." },
        title: { type: "string" },
        decision: { type: ["string", "null"] },
        why: { type: ["string", "null"] },
        state: { type: "string", enum: THREAD_STATE_ORDER, description: stateDescription },
        cluster: { type: ["string", "null"] },
      },
      required: ["thread"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const { id } = await resolveThread(input.thread);
      const clusterId = input.cluster
        ? await ensureCluster(input.cluster)
        : input.cluster === null
          ? null
          : undefined;

      const thread = await db.thread.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.decision !== undefined ? { decision: input.decision } : {}),
          ...(input.why !== undefined ? { why: input.why } : {}),
          ...(input.state !== undefined ? { state: input.state as never } : {}),
          ...(clusterId !== undefined ? { clusterId } : {}),
          ...(input.state === "OPEN" ? { closedAt: null } : {}),
          ...(input.state === "DONE" || input.state === "ABANDONED"
            ? { closedAt: new Date() }
            : {}),
        },
        select: { ...threadListSelect, why: true, outcome: true },
      });
      await tryEmbedThread(
        thread.id,
        thread.title,
        thread.decision,
        [thread.why, thread.outcome].filter(Boolean).join("\n\n") || null,
      );
      return thread;
    },
  },
  {
    name: "close_thread",
    description:
      "Close a thread and roll it up: the AI reads every entry and writes what came of it — what worked, what didn't and why — then carries the ideas the work threw off into the Feature Library (deduped against what's already there). This is the payoff for logging as you go. Use finalState ABANDONED when the work was dropped on purpose.",
    inputSchema: {
      type: "object",
      properties: {
        thread: { type: "string", description: "Thread id or slug." },
        finalState: { type: "string", enum: ["DONE", "ABANDONED"] },
      },
      required: ["thread"],
    },
    handler: async (args) => {
      const input = z
        .object({
          thread: z.string().min(1),
          finalState: z.enum(["DONE", "ABANDONED"]).optional(),
        })
        .parse(args);
      if (!isOpenAIAvailable()) {
        throw new Error("OPENAI_API_KEY is not set on the server — roll-up is disabled.");
      }
      const { id, slug } = await resolveThread(input.thread);
      const result = await rollUpThread(id, input.finalState ?? "DONE");
      return { slug, ...result };
    },
  },
  {
    name: "delete_thread",
    description:
      "Delete a thread. Its log entries are kept and unfiled, never deleted — the record of what happened outlives the thread that held it.",
    inputSchema: {
      type: "object",
      properties: { thread: { type: "string", description: "Thread id or slug." } },
      required: ["thread"],
    },
    handler: async (args) => {
      const { thread: ref } = z.object({ thread: z.string().min(1) }).parse(args);
      const { id, slug } = await resolveThread(ref);
      const { count } = await db.logEntry.updateMany({
        where: { threadId: id },
        data: { threadId: null },
      });
      await db.chatSession.updateMany({ where: { threadId: id }, data: { threadId: null } });
      await db.thread.delete({ where: { id } });
      return { deleted: true, slug, entriesUnfiled: count };
    },
  },
];
