import { z } from "zod";

import { runChatTurn, type ThreadContextLite } from "@/lib/ai/chat";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";

import type { ToolDef } from "./types";

const sessionSelect = {
  id: true,
  title: true,
  userId: true,
  threadId: true,
  createdAt: true,
  updatedAt: true,
  thread: { select: { id: true, slug: true, title: true } },
  _count: { select: { messages: true } },
} as const;

export const CHAT_TOOLS: ToolDef[] = [
  {
    name: "create_chat_session",
    description:
      "Start a new chat session with the in-app assistant. Optional threadId " +
      "are auto-injected into the system prompt as context. The session is owned by the API token holder.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Defaults to 'New chat'." },
        threadId: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      const { title, threadId } = z
        .object({
          title: z.string().optional(),
          threadId: z.string().optional(),
        })
        .parse(args);
      const session = await db.chatSession.create({
        data: {
          title: title ?? "New chat",
          userId: ctx.userId,
          threadId: threadId ?? null,
        },
        select: sessionSelect,
      });
      return session;
    },
  },

  {
    name: "append_chat_message",
    description:
      "Append a USER message to a chat session. " +
      "Assistant responses are produced by the in-app server (not via this MCP), so this tool only accepts user-role messages. " +
      "Use this to seed a session from outside the web UI.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        content: { type: "string" },
      },
      required: ["sessionId", "content"],
    },
    handler: async (args) => {
      const { sessionId, content } = z
        .object({ sessionId: z.string().min(1), content: z.string().min(1) })
        .parse(args);
      const msg = await db.chatMessage.create({
        data: { sessionId, role: "USER", content },
      });
      return msg;
    },
  },

  {
    name: "send_chat_message",
    description:
      "Send a user message to the in-app Copilot and get the AI's reply — the full turn " +
      "(persist user message, semantic search for context, model call, persist assistant " +
      "reply), identical to typing in the web UI. Omit sessionId to auto-create a session " +
      "titled from the message. Use append_chat_message instead if you only want to store " +
      "a message without an AI response.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Existing session; omit to auto-create." },
        content: { type: "string", description: "The user message." },
        threadId: { type: "string", description: "Optional thread context (only used when auto-creating)." },
      },
      required: ["content"],
    },
    handler: async (args, ctx) => {
      const input = z
        .object({
          sessionId: z.string().optional(),
          content: z.string().min(1),
          threadId: z.string().optional(),
        })
        .parse(args);
      if (!isOpenAIAvailable()) {
        throw new Error("OPENAI_API_KEY is not set. The in-app LLM is disabled.");
      }

      let sessionId = input.sessionId ?? null;
      let threadId = input.threadId ?? null;
      if (sessionId) {
        const existing = await db.chatSession.findUnique({
          where: { id: sessionId },
          select: { threadId: true },
        });
        if (!existing) throw new Error(`Chat session not found: ${sessionId}`);
        threadId = existing.threadId;
      } else {
        const title =
          input.content.length > 60 ? `${input.content.slice(0, 60)}…` : input.content;
        const created = await db.chatSession.create({
          data: { title, userId: ctx.userId, threadId },
          select: { id: true },
        });
        sessionId = created.id;
      }

      let thread: ThreadContextLite | null = null;
      if (threadId) {
        const t = await db.thread.findUnique({
          where: { id: threadId },
          select: { id: true, title: true, state: true, decision: true },
        });
        if (t) thread = t;
      }

      const turn = await runChatTurn({
        sessionId,
        userMessage: input.content,
        thread,
      });
      const citedNotes = turn.citedNoteIds.length
        ? await db.wikiNote.findMany({
            where: { id: { in: turn.citedNoteIds } },
            select: { id: true, slug: true, title: true },
          })
        : [];
      return { sessionId, assistantText: turn.assistantText, citedNotes };
    },
  },

  {
    name: "list_chat_sessions",
    description: "List chat sessions, default sort updatedAt desc. Optionally filter by thread.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string" },
        threadSlug: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args, ctx) => {
      const { threadId, threadSlug, limit } = z
        .object({
          threadId: z.string().optional(),
          threadSlug: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);

      const where: Record<string, unknown> = { userId: ctx.userId };
      if (threadId) where.threadId = threadId;
      else if (threadSlug) where.thread = { slug: threadSlug };

      const sessions = await db.chatSession.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit ?? 50,
        select: sessionSelect,
      });
      return { sessions, count: sessions.length };
    },
  },

  {
    name: "get_chat_session",
    description: "Fetch a chat session with all its messages.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      const session = await db.chatSession.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          thread: { select: { id: true, slug: true, title: true } },
        },
      });
      if (!session) throw new Error(`Chat session not found: ${id}`);
      return session;
    },
  },

  {
    name: "delete_chat_session",
    description: "Delete a chat session and all its messages.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      await db.chatSession.delete({ where: { id } });
      return { ok: true, id };
    },
  },
];
