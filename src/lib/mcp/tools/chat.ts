import { z } from "zod";

import { db } from "@/lib/db";

import type { ToolDef } from "./types";

const sessionSelect = {
  id: true,
  title: true,
  userId: true,
  sprintId: true,
  focusTaskId: true,
  createdAt: true,
  updatedAt: true,
  sprint: { select: { id: true, slug: true, name: true } },
  _count: { select: { messages: true } },
} as const;

export const CHAT_TOOLS: ToolDef[] = [
  {
    name: "create_chat_session",
    description:
      "Start a new chat session with the in-app assistant. Optional sprintId / focusTaskId " +
      "are auto-injected into the system prompt as context. The session is owned by the API token holder.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Defaults to 'New chat'." },
        sprintId: { type: "string" },
        focusTaskId: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      const { title, sprintId, focusTaskId } = z
        .object({
          title: z.string().optional(),
          sprintId: z.string().optional(),
          focusTaskId: z.string().optional(),
        })
        .parse(args);
      const session = await db.chatSession.create({
        data: {
          title: title ?? "New chat",
          userId: ctx.userId,
          sprintId: sprintId ?? null,
          focusTaskId: focusTaskId ?? null,
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
    name: "list_chat_sessions",
    description: "List chat sessions, default sort updatedAt desc. Optionally filter by sprint.",
    inputSchema: {
      type: "object",
      properties: {
        sprintId: { type: "string" },
        sprintSlug: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args, ctx) => {
      const { sprintId, sprintSlug, limit } = z
        .object({
          sprintId: z.string().optional(),
          sprintSlug: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);

      const where: Record<string, unknown> = { userId: ctx.userId };
      if (sprintId) where.sprintId = sprintId;
      else if (sprintSlug) where.sprint = { slug: sprintSlug };

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
          sprint: { select: { id: true, slug: true, name: true } },
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
