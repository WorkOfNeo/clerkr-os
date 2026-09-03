import { Prisma, type IntakeKind } from "@prisma/client";

import { db } from "@/lib/db";

import { embedText, toVectorLiteral } from "./embed";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { getIntakePrompt } from "./prompts";

/**
 * The intake desk.
 *
 * Raw text in, proposed records out. The model decides WHAT the text is — a
 * meeting to structure, three separate bugs, a card for the board, a note worth
 * keeping — and each conclusion becomes an IntakeProposal the user confirms.
 * Nothing is written to the product until somebody accepts a card.
 *
 * Every proposal is then checked against what already exists (`findNearest`),
 * because the failure mode of an intake box is a fifth copy of the same ticket.
 */

/** Above this cosine similarity we assume it's the same thing and lead with
 *  "comment on the existing one" rather than "file a new one". Tuned high on
 *  purpose: a false "duplicate" hides real work, which is worse than a dupe. */
export const DUPLICATE_THRESHOLD = 0.86;

export interface IntakeResult {
  messageId: string;
  reply: string;
  proposalCount: number;
}

interface RawProposal {
  kind: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
}

const KINDS: IntakeKind[] = ["TICKET", "MEETING", "WIKI_NOTE", "KANBAN_CARD", "FEATURE", "COMMENT"];

function normaliseKind(v: unknown): IntakeKind | null {
  const s = String(v ?? "").toUpperCase().replace(/[\s-]/g, "_");
  return (KINDS as string[]).includes(s) ? (s as IntakeKind) : null;
}

/** Which table a proposal of this kind should be deduped against. */
const MATCH_TABLE: Partial<Record<IntakeKind, { table: string; type: string }>> = {
  TICKET: { table: "ticket", type: "ticket" },
  FEATURE: { table: "feature", type: "feature" },
  MEETING: { table: "meeting", type: "meeting" },
  WIKI_NOTE: { table: "wiki_note", type: "wiki_note" },
};

export interface NearestMatch {
  type: string;
  id: string;
  title: string;
  score: number;
}

/**
 * Nearest existing record of the matching kind, by cosine distance.
 *
 * Raw SQL because the table is chosen at runtime and pgvector columns are
 * `Unsupported` in the generated client either way. The table name comes from
 * MATCH_TABLE above — a fixed internal map, never from model output — so it is
 * never interpolated from anything a user or the LLM controls.
 */
export async function findNearest(
  kind: IntakeKind,
  text: string,
): Promise<NearestMatch | null> {
  const target = MATCH_TABLE[kind];
  if (!target) return null;

  try {
    const literal = toVectorLiteral(await embedText(text));
    const rows = await db.$queryRaw<{ id: string; title: string; score: number }[]>(
      Prisma.sql`
        SELECT id, title, 1 - (embedding <=> ${literal}::vector) AS score
          FROM ${Prisma.raw(`"${target.table}"`)}
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> ${literal}::vector
         LIMIT 1
      `,
    );
    const hit = rows[0];
    if (!hit) return null;
    return { type: target.type, id: hit.id, title: hit.title, score: Number(hit.score) };
  } catch (err) {
    // Matching is a nicety — never lose the proposal because dedupe failed.
    console.warn(`[intake] findNearest(${kind}) failed:`, err);
    return null;
  }
}

/** The vocabulary the model must pick from. Passing the live lists is what
 *  stops it inventing a category or a column that doesn't exist. */
export async function loadVocabulary() {
  const [categories, columns, clusters, recentTickets, recentFeatures] = await Promise.all([
    db.ticketCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
    db.kanbanColumn.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true, isDone: true } }),
    db.cluster.findMany({ orderBy: { name: "asc" }, take: 40, select: { name: true } }),
    db.ticket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { number: true, title: true },
    }),
    db.feature.findMany({ orderBy: { title: "asc" }, take: 60, select: { title: true } }),
  ]);
  return { categories, columns, clusters, recentTickets, recentFeatures };
}

export function vocabularyBlock(v: Awaited<ReturnType<typeof loadVocabulary>>): string {
  const parts: string[] = ["WHAT ALREADY EXISTS — use these exact values, and prefer COMMENT over a near-duplicate:"];
  parts.push(
    "Ticket categories (use the slug) —\n" +
      (v.categories.map((c) => `- ${c.slug} (${c.label})`).join("\n") || "- (none defined)"),
  );
  parts.push(
    "Kanban columns (use the name) —\n" +
      (v.columns.map((c) => `- ${c.name}${c.isDone ? " [terminal]" : ""}`).join("\n") ||
        "- (none defined)"),
  );
  if (v.clusters.length) {
    parts.push("Existing product areas —\n" + v.clusters.map((c) => `- ${c.name}`).join("\n"));
  }
  if (v.recentTickets.length) {
    parts.push(
      "Open tickets —\n" + v.recentTickets.map((t) => `- #${t.number} ${t.title}`).join("\n"),
    );
  }
  if (v.recentFeatures.length) {
    parts.push("Feature library —\n" + v.recentFeatures.map((f) => `- ${f.title}`).join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * Classify one paste and persist the proposals against a new assistant message.
 * The user message must already exist — the caller owns it, so attachments can
 * be pinned to it before the model ever runs.
 */
export async function classifyIntake(params: {
  sessionId: string;
  rawText: string;
}): Promise<IntakeResult> {
  const { sessionId, rawText } = params;
  const client = getOpenAI();

  const [systemPrompt, vocabulary] = await Promise.all([getIntakePrompt(), loadVocabulary()]);

  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    // Structured output — the whole contract is a JSON object, so ask for one
    // rather than parsing prose and hoping.
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: `${systemPrompt}\n\n${vocabularyBlock(vocabulary)}` },
      { role: "user", content: rawText },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let parsed: { reply?: string; proposals?: RawProposal[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { reply: "I couldn't read that back cleanly — try rephrasing?", proposals: [] };
  }

  const reply = String(parsed.reply ?? "").trim() || "Here's what I found.";
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.slice(0, 20) : [];

  const message = await db.chatMessage.create({
    data: { sessionId, role: "ASSISTANT", content: reply },
    select: { id: true },
  });

  let order = 0;
  for (const p of proposals) {
    const kind = normaliseKind(p.kind);
    const title = String(p.title ?? "").trim();
    if (!kind || !title) continue;

    const body = p.body ? String(p.body) : null;
    const match = await findNearest(kind, `${title}\n\n${body ?? ""}`);

    await db.intakeProposal.create({
      data: {
        messageId: message.id,
        kind,
        order: order++,
        title: title.slice(0, 300),
        body,
        payload: (p.payload ?? {}) as Prisma.InputJsonValue,
        matchType: match?.type ?? null,
        matchId: match?.id ?? null,
        matchTitle: match?.title ?? null,
        matchScore: match?.score ?? null,
      },
    });
  }

  await db.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });

  return { messageId: message.id, reply, proposalCount: order };
}
