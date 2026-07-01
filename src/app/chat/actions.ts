"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runChatTurn } from "@/lib/ai/chat";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export interface ChatMessageDTO {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citedNoteIds: string[];
  createdAt: string;
}

export interface ChatTurnResponse {
  sessionId: string;
  messages: ChatMessageDTO[];
  citedNotes: { id: string; slug: string; title: string }[];
  error?: string;
}

export async function createChatSession(input: {
  title?: string;
  sprintId?: string | null;
  focusTaskId?: string | null;
}): Promise<{ id: string }> {
  const session = await requireSession();
  const created = await db.chatSession.create({
    data: {
      title: input.title?.trim() || "New chat",
      userId: session.user.id,
      sprintId: input.sprintId ?? null,
      focusTaskId: input.focusTaskId ?? null,
    },
    select: { id: true },
  });
  revalidatePath("/chat");
  return created;
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessageDTO[]> {
  await requireSession();
  const msgs = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citedNoteIds: m.citedNoteIds,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function sendChatMessage(input: {
  sessionId: string | null;
  userMessage: string;
  sprintId?: string | null;
  focusTaskId?: string | null;
}): Promise<ChatTurnResponse> {
  const session = await requireSession();
  const userMessage = input.userMessage.trim();
  if (!userMessage) throw new Error("Empty message");

  if (!isOpenAIAvailable()) {
    return {
      sessionId: input.sessionId ?? "",
      messages: [],
      citedNotes: [],
      error: "OPENAI_API_KEY is not set. The in-app LLM is disabled.",
    };
  }

  let sessionId = input.sessionId;
  if (!sessionId) {
    // Auto-create.
    const title = userMessage.length > 60 ? `${userMessage.slice(0, 60)}…` : userMessage;
    const created = await db.chatSession.create({
      data: {
        title,
        userId: session.user.id,
        sprintId: input.sprintId ?? null,
        focusTaskId: input.focusTaskId ?? null,
      },
      select: { id: true },
    });
    sessionId = created.id;
  }

  // Build sprint context if applicable.
  let sprint = null;
  if (input.sprintId) {
    const s = await db.sprint.findUnique({
      where: { id: input.sprintId },
      select: { id: true, name: true, state: true, goal: true, startDate: true, endDate: true },
    });
    if (s) sprint = s;
  }

  let focusTask = null;
  if (input.focusTaskId) {
    const t = await db.task.findUnique({
      where: { id: input.focusTaskId },
      select: { id: true, name: true, status: { select: { label: true } } },
    });
    if (t) focusTask = { id: t.id, name: t.name, status: t.status.label };
  }

  try {
    const turn = await runChatTurn({
      sessionId,
      userMessage,
      sprint,
      focusTask,
    });

    const messages = await getSessionMessages(sessionId);
    const citedNotes = turn.citedNoteIds.length
      ? await db.wikiNote.findMany({
          where: { id: { in: turn.citedNoteIds } },
          select: { id: true, slug: true, title: true },
        })
      : [];

    revalidatePath(`/chat/${sessionId}`);
    return { sessionId, messages, citedNotes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      sessionId,
      messages: await getSessionMessages(sessionId),
      citedNotes: [],
      error: message,
    };
  }
}

export async function deleteChatSession(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.chatSession.delete({ where: { id } });
  revalidatePath("/chat");
  redirect("/chat");
}

export async function saveAssistantTurnToWiki(input: {
  messageId: string;
  title: string;
  body: string;
  tags?: string[];
}): Promise<{ slug: string }> {
  const session = await requireSession();
  const msg = await db.chatMessage.findUnique({
    where: { id: input.messageId },
    select: { sessionId: true, session: { select: { sprint: { select: { slug: true } } } } },
  });

  const tags = input.tags ?? [];
  if (msg?.session?.sprint?.slug) {
    const sprintTag = `sprint-${msg.session.sprint.slug}`;
    if (!tags.includes(sprintTag)) tags.push(sprintTag);
  }

  const { createWikiNote } = await import("@/app/wiki/actions");
  const { slug } = await createWikiNote({ title: input.title, body: input.body, tags });
  return { slug };
}

export async function ensureSessionForSprint(input: {
  sprintId: string | null;
}): Promise<{ id: string; messages: ChatMessageDTO[] } | null> {
  const session = await requireSession();
  // Try to find the most recent session this user has for this sprint context;
  // create a new one if none exists.
  const existing = await db.chatSession.findFirst({
    where: { userId: session.user.id, sprintId: input.sprintId ?? null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  let sessionId = existing?.id;
  if (!sessionId) {
    const created = await db.chatSession.create({
      data: {
        title: input.sprintId ? "Sprint chat" : "Chat",
        userId: session.user.id,
        sprintId: input.sprintId ?? null,
      },
      select: { id: true },
    });
    sessionId = created.id;
  }
  const messages = await getSessionMessages(sessionId);
  return { id: sessionId, messages };
}
