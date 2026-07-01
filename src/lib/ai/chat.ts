import { db } from "@/lib/db";

import {
  semanticSearchFeatures,
  semanticSearchMeetings,
  type FeatureHit,
  type MeetingHit,
} from "./embed-entities";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { getChatPrompt } from "./prompts";
import { semanticSearchWiki } from "./wiki-search";

export interface SprintContextLite {
  id: string;
  name: string;
  state: string;
  goal: string | null;
  startDate: Date;
  endDate: Date;
}

export interface FocusTaskLite {
  id: string;
  name: string;
  status: string;
}

export interface ChatTurnResult {
  assistantText: string;
  citedNoteIds: string[];
}

const HISTORY_LIMIT = 12;

export async function runChatTurn(params: {
  sessionId: string;
  userMessage: string;
  sprint?: SprintContextLite | null;
  focusTask?: FocusTaskLite | null;
}): Promise<ChatTurnResult> {
  const { sessionId, userMessage, sprint, focusTask } = params;
  const client = getOpenAI();

  await db.chatMessage.create({
    data: { sessionId, role: "USER", content: userMessage },
  });

  let citedNotes: { id: string; title: string; body: string }[] = [];
  try {
    const hits = await semanticSearchWiki(userMessage, { limit: 5 });
    citedNotes = hits.map((h) => ({ id: h.id, title: h.title, body: h.body }));
  } catch (err) {
    // Don't abort the turn on search failure — degrade to no citations.
    console.warn("[chat] semanticSearchWiki failed:", err);
  }

  let meetingHits: MeetingHit[] = [];
  let featureHits: FeatureHit[] = [];
  try {
    [meetingHits, featureHits] = await Promise.all([
      semanticSearchMeetings(userMessage, 3),
      semanticSearchFeatures(userMessage, 5),
    ]);
  } catch (err) {
    console.warn("[chat] entity semantic search failed:", err);
  }

  const recent = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT + 1, // include the just-inserted user msg, dropped below
    select: { role: true, content: true },
  });
  const prior = recent.reverse().slice(0, -1);

  const [product, basePrompt] = await Promise.all([loadProductContext(), getChatPrompt()]);
  const systemPrompt = buildSystemPrompt(basePrompt, sprint ?? null, focusTask ?? null, citedNotes, product, {
    meetings: meetingHits,
    features: featureHits,
  });
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...prior.map((m) => ({
      role: m.role.toLowerCase() as "system" | "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    temperature: 0.4,
  });
  const assistantText = resp.choices[0]?.message?.content ?? "";

  await db.chatMessage.create({
    data: {
      sessionId,
      role: "ASSISTANT",
      content: assistantText,
      citedNoteIds: citedNotes.map((n) => n.id),
    },
  });

  await db.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return { assistantText, citedNoteIds: citedNotes.map((n) => n.id) };
}

interface ProductContext {
  roadmap: { title: string; lane: string; themeTag: string | null }[];
  features: { title: string; status: string; cluster: string | null }[];
  meetings: { title: string; tldr: string | null; date: string }[];
}

async function loadProductContext(): Promise<ProductContext> {
  try {
    const [roadmap, features, meetings] = await Promise.all([
      db.roadmapItem.findMany({
        orderBy: [{ lane: "asc" }, { order: "asc" }],
        select: { title: true, lane: true, themeTag: true },
      }),
      db.feature.findMany({
        orderBy: { title: "asc" },
        take: 80,
        select: { title: true, status: true, cluster: { select: { name: true } } },
      }),
      db.meeting.findMany({
        where: { structuredAt: { not: null } },
        orderBy: { meetingDate: "desc" },
        take: 8,
        select: { title: true, tldr: true, meetingDate: true },
      }),
    ]);
    return {
      roadmap: roadmap.map((r) => ({ title: r.title, lane: r.lane, themeTag: r.themeTag })),
      features: features.map((f) => ({
        title: f.title,
        status: f.status,
        cluster: f.cluster?.name ?? null,
      })),
      meetings: meetings.map((m) => ({
        title: m.title,
        tldr: m.tldr,
        date: m.meetingDate.toISOString().slice(0, 10),
      })),
    };
  } catch (err) {
    // Degrade gracefully — product context is additive, never block the turn.
    console.warn("[chat] loadProductContext failed:", err);
    return { roadmap: [], features: [], meetings: [] };
  }
}

function buildSystemPrompt(
  basePrompt: string,
  sprint: SprintContextLite | null,
  focusTask: FocusTaskLite | null,
  notes: { id: string; title: string; body: string }[],
  product: ProductContext,
  semantic: { meetings: MeetingHit[]; features: FeatureHit[] },
): string {
  const parts: string[] = [];

  parts.push(basePrompt);

  if (sprint) {
    const range = `${sprint.startDate.toISOString().slice(0, 10)} → ${sprint.endDate
      .toISOString()
      .slice(0, 10)}`;
    parts.push(
      `Active sprint: ${sprint.name} (state: ${sprint.state}, ${range})` +
        (sprint.goal ? `. Goal: ${sprint.goal}` : "."),
    );
  }
  if (focusTask) {
    parts.push(`Focused task: ${focusTask.name} (status: ${focusTask.status}).`);
  }

  if (product.roadmap.length || product.features.length || product.meetings.length) {
    parts.push("PRODUCT CONTEXT (live data — cite specific titles):");
    if (product.roadmap.length) {
      const byLane = (lane: string) =>
        product.roadmap
          .filter((r) => r.lane === lane)
          .map((r) => r.title)
          .join("; ") || "(none)";
      parts.push(
        `Roadmap —\nNow: ${byLane("NOW")}\nNext: ${byLane("NEXT")}\nLater: ${byLane("LATER")}`,
      );
    }
    if (product.features.length) {
      parts.push(
        "Feature library —\n" +
          product.features
            .map((f) => `- ${f.title} [${f.status}${f.cluster ? `, ${f.cluster}` : ""}]`)
            .join("\n"),
      );
    }
    if (product.meetings.length) {
      parts.push(
        "Recent meeting briefs —\n" +
          product.meetings
            .map((m) => `- ${m.title} (${m.date})${m.tldr ? `: ${m.tldr}` : ""}`)
            .join("\n"),
      );
    }
  }

  if (semantic.features.length || semantic.meetings.length) {
    parts.push("MOST RELEVANT TO THIS QUESTION (semantic search — prefer these):");
    if (semantic.features.length) {
      parts.push(
        "Features —\n" +
          semantic.features
            .map((f) => `- ${f.title} [${f.status}]${f.description ? `: ${f.description}` : ""}`)
            .join("\n"),
      );
    }
    if (semantic.meetings.length) {
      parts.push(
        "Meetings —\n" +
          semantic.meetings.map((m) => `- ${m.title}${m.tldr ? `: ${m.tldr}` : ""}`).join("\n"),
      );
    }
  }

  if (notes.length > 0) {
    parts.push("Relevant wiki notes:");
    notes.forEach((n, i) => {
      const excerpt = n.body.length > 600 ? `${n.body.slice(0, 600)}…` : n.body;
      parts.push(`[${i + 1}] ${n.title}\n${excerpt}`);
    });
  }

  return parts.join("\n\n");
}
