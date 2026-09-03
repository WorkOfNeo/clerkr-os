import { db } from "@/lib/db";

import {
  semanticSearchFeatures,
  semanticSearchMeetings,
  semanticSearchTickets,
  type FeatureHit,
  type MeetingHit,
  type TicketHit,
} from "./embed-entities";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { activeMemories, markApplied, renderMemoryBlock, type MemoryRow } from "@/lib/memory/memory";

import { getChatPrompt } from "./prompts";
import { semanticSearchWiki } from "./wiki-search";

export interface TicketContextLite {
  id: string;
  number: number;
  title: string;
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
  ticket?: TicketContextLite | null;
}): Promise<ChatTurnResult> {
  const { sessionId, userMessage, ticket } = params;
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
  let ticketHits: TicketHit[] = [];
  try {
    [meetingHits, featureHits, ticketHits] = await Promise.all([
      semanticSearchMeetings(userMessage, 3),
      semanticSearchFeatures(userMessage, 5),
      semanticSearchTickets(userMessage, 6),
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

  const [product, basePrompt, memories] = await Promise.all([
    loadProductContext(),
    getChatPrompt(),
    activeMemories(),
  ]);
  const systemPrompt = buildSystemPrompt(withMemory(basePrompt, memories), ticket ?? null, citedNotes, product, {
    meetings: meetingHits,
    features: featureHits,
    tickets: ticketHits,
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

  await markApplied(memories.map((m) => m.id));

  return { assistantText, citedNoteIds: citedNotes.map((n) => n.id) };
}

/** What the team has taught it, ahead of the base persona's own rules. */
function withMemory(basePrompt: string, memories: MemoryRow[]): string {
  const block = renderMemoryBlock(memories);
  return block ? `${basePrompt}\n\n${block}` : basePrompt;
}

interface ProductContext {
  roadmap: { title: string; lane: string; themeTag: string | null }[];
  features: { title: string; status: string; cluster: string | null }[];
  meetings: { title: string; tldr: string | null; date: string }[];
  openTickets: { number: number; title: string; status: string; category: string | null }[];
}

async function loadProductContext(): Promise<ProductContext> {
  try {
    const [roadmap, features, meetings, openTickets] = await Promise.all([
      db.kanbanCard.findMany({
        orderBy: [{ columnId: "asc" }, { order: "asc" }],
        take: 120,
        select: { title: true, themeTag: true, column: { select: { name: true } } },
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
      db.ticket.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 30,
        select: {
          number: true,
          title: true,
          status: true,
          category: { select: { label: true } },
        },
      }),
    ]);
    return {
      roadmap: roadmap.map((r) => ({ title: r.title, lane: r.column.name, themeTag: r.themeTag })),
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
      openTickets: openTickets.map((t) => ({
        number: t.number,
        title: t.title,
        status: t.status,
        category: t.category?.label ?? null,
      })),
    };
  } catch (err) {
    // Degrade gracefully — product context is additive, never block the turn.
    console.warn("[chat] loadProductContext failed:", err);
    return { roadmap: [], features: [], meetings: [], openTickets: [] };
  }
}

function buildSystemPrompt(
  basePrompt: string,
  ticket: TicketContextLite | null,
  notes: { id: string; title: string; body: string }[],
  product: ProductContext,
  semantic: {
    meetings: MeetingHit[];
    features: FeatureHit[];
    tickets: TicketHit[];
  },
): string {
  const parts: string[] = [];

  parts.push(basePrompt);

  if (ticket) {
    parts.push(`Focused ticket: #${ticket.number} ${ticket.title} (status: ${ticket.status}).`);
  }

  if (
    product.roadmap.length ||
    product.features.length ||
    product.meetings.length ||
    product.openTickets.length
  ) {
    parts.push("PRODUCT CONTEXT (live data — cite specific titles):");
    if (product.openTickets.length) {
      parts.push(
        "Open tickets —\n" +
          product.openTickets
            .map(
              (t) =>
                `- #${t.number} ${t.title} [${t.status}${t.category ? `, ${t.category}` : ""}]`,
            )
            .join("\n"),
      );
    }
    if (product.roadmap.length) {
      // Columns are user-defined now, so group by whatever they actually are
      // rather than the three lanes this used to assume.
      const byColumn = new Map<string, string[]>();
      for (const r of product.roadmap) {
        const list = byColumn.get(r.lane) ?? [];
        list.push(r.title);
        byColumn.set(r.lane, list);
      }
      parts.push(
        "Kanban board —\n" +
          Array.from(byColumn.entries())
            .map(([column, titles]) => `${column}: ${titles.join("; ")}`)
            .join("\n"),
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

  if (
    semantic.features.length ||
    semantic.meetings.length ||
    semantic.tickets.length
  ) {
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
    if (semantic.tickets.length) {
      parts.push(
        "Tickets —\n" +
          semantic.tickets
            .map(
              (t) =>
                `- #${t.number} ${t.title} [${t.status}${t.category ? `, ${t.category}` : ""}]` +
                `${t.body ? `: ${t.body.slice(0, 200)}` : ""}`,
            )
            .join("\n"),
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
