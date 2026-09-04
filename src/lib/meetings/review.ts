import type { IntakeKind } from "@prisma/client";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import {
  semanticSearchFeatures,
  semanticSearchMeetings,
  semanticSearchTickets,
} from "@/lib/ai/embed-entities";
import { CHAT_MODEL, getOpenAI } from "@/lib/ai/openai";
import { semanticSearchWiki } from "@/lib/ai/wiki-search";
import { db } from "@/lib/db";

/**
 * The reviewer: an agent pass between "the model extracted a brief" and "the
 * cards appear". It can search the workspace, and it has to say why.
 *
 * Same tool-loop pattern as the chat agent (src/lib/ai/agent.ts), kept
 * separate because the job is different: the chat agent decides what to file
 * from a conversation; this one checks a list it was handed against what
 * already exists, merges duplicates, drops noise, and writes one line of
 * reasoning per card plus a trace of what it looked up. The trace is stored
 * on the meeting and shown on the page — a proposal never appears without the
 * thinking behind it.
 *
 * Best-effort by contract: the caller falls back to the raw extraction if this
 * throws or never finalizes, so a review hiccup can't lose a brief.
 */

export interface Draft {
  kind: IntakeKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  /** Set by the reviewer when it found the same thing already in the system. */
  existing?: { type: string; id: string; title: string } | null;
}

export type ReasoningStep =
  | { kind: "search"; query: string; stores: string[]; hits: string[] }
  | { kind: "finalize"; kept: number; dropped: { title: string; why: string }[] }
  | { kind: "note"; text: string };

export interface ReasoningTrace {
  summary: string;
  steps: ReasoningStep[];
  model: string;
  at: string;
  /** False when the reviewer did not run or did not finish — the cards shown
   *  are the raw extraction. */
  completed: boolean;
}

export function unreviewedTrace(reason: string): ReasoningTrace {
  return {
    summary: reason,
    steps: [],
    model: CHAT_MODEL,
    at: new Date().toISOString(),
    completed: false,
  };
}

/** Narrow a stored Json column back to a trace without trusting its shape. */
export function parseTrace(value: unknown): ReasoningTrace | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.summary !== "string" || !Array.isArray(v.steps)) return null;
  return {
    summary: v.summary,
    steps: v.steps.filter((s): s is ReasoningStep => Boolean(s) && typeof s === "object"),
    model: typeof v.model === "string" ? v.model : "",
    at: typeof v.at === "string" ? v.at : "",
    completed: v.completed === true,
  };
}

const MAX_STEPS = 6;
const TRANSCRIPT_EXCERPT = 6000;

const STORES = ["tickets", "features", "meetings", "wiki"] as const;
type Store = (typeof STORES)[number];

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_workspace",
      description:
        "Search what already exists, by meaning: tickets, features in the library, earlier " +
        "meetings, wiki notes. Use it to find out whether an item from this meeting was already " +
        "raised, decided, or built. Group related items into one query; you have a small budget.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What you are looking for, in plain language." },
          stores: {
            type: "array",
            items: { type: "string", enum: [...STORES] },
            description: "Which stores to search. Omit to search all.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize",
      description:
        "Hand back the reviewed list. Call this exactly once, when you are done searching. " +
        "Every item you keep needs a one-line `why`; every item you drop needs one too.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "2-4 plain sentences on how you read this meeting: what you checked, what was " +
              "already tracked, what you merged or dropped. Written for the person reviewing " +
              "the cards.",
          },
          keep: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer", description: "The item's number in the list you were given." },
                why: { type: "string", description: "One line: why this deserves a card." },
                title: { type: "string", description: "A tighter title, if the extracted one was vague." },
                body: { type: "string", description: "Corrected detail, if needed." },
                existingType: {
                  type: "string",
                  enum: ["ticket", "feature", "meeting", "wiki_note"],
                  description: "If this is already tracked: what kind of record you found.",
                },
                existingId: {
                  type: "string",
                  description: "The id of that record, exactly as search_workspace returned it.",
                },
              },
              required: ["index", "why"],
            },
          },
          drop: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                why: { type: "string", description: "One line: why this should not become a card." },
              },
              required: ["index", "why"],
            },
          },
        },
        required: ["summary", "keep"],
      },
    },
  },
];

const REVIEW_RULES = `You review a brief that was just extracted from a meeting, before it is shown to a person as proposal cards. Nothing is created by you; you decide what deserves a card and explain why.

Do, in this order:
1. Read the list. Merge items that are the same thing said twice (keep one, drop the other and say it was merged).
2. Search the workspace for anything that might already exist — a feature idea that is already in the library, an action item that is already a ticket, a decision that contradicts an earlier one. Group related items into one search. Do not search for things that obviously cannot exist yet.
3. Drop noise: pleasantries, restatements of the transcript, "we should think about X" with no substance, duplicates of what you already kept.
4. Call finalize once. Keep everything real. When something is already tracked, KEEP it and point at the existing record with existingType/existingId — the person chooses whether to link or create, you do not decide that for them.

Rules:
- One line of why per item, in plain words a founder can scan: "Already tracked as #14", "New — nothing similar in the library", "Merged with item 3".
- Never invent an existingId. Only use ids that search_workspace returned.
- Do not rewrite items you have no reason to change. A tighter title is fine when the extracted one is vague.
- You are reviewing, not chatting. No preamble, no questions; the finalize call is your whole answer.`;

function summariseDraft(d: Draft, i: number): string {
  const extras: string[] = [];
  const p = d.payload;
  if (typeof p.owner === "string" && p.owner) extras.push(`owner: ${p.owner}`);
  if (typeof p.assignee === "string" && p.assignee) extras.push(`assignee: ${p.assignee}`);
  if (typeof p.dueDate === "string" && p.dueDate) extras.push(`due: ${p.dueDate}`);
  if (typeof p.cluster === "string" && p.cluster) extras.push(`area: ${p.cluster}`);
  if (typeof p.signalStatus === "string" && p.signalStatus) extras.push(`status: ${p.signalStatus}`);
  const line = `${i + 1}. [${d.kind}] ${d.title}`;
  const detail = d.body ? `\n   ${d.body}` : "";
  const meta = extras.length ? `\n   (${extras.join(", ")})` : "";
  return line + detail + meta;
}

export async function reviewDrafts(
  meeting: { title: string; transcript: string },
  drafts: Draft[],
): Promise<{ drafts: Draft[]; trace: ReasoningTrace }> {
  const at = new Date().toISOString();
  const steps: ReasoningStep[] = [];

  if (!drafts.length) {
    return {
      drafts,
      trace: { summary: "The extraction found nothing to propose.", steps, model: CHAT_MODEL, at, completed: true },
    };
  }

  const client = getOpenAI();
  const excerpt =
    meeting.transcript.length > TRANSCRIPT_EXCERPT
      ? `${meeting.transcript.slice(0, TRANSCRIPT_EXCERPT)}\n[…truncated]`
      : meeting.transcript;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_RULES },
    {
      role: "user",
      content:
        `Meeting: ${meeting.title}\n\n` +
        `EXTRACTED ITEMS (refer to them by number):\n${drafts.map(summariseDraft).join("\n")}\n\n` +
        `TRANSCRIPT, for context:\n${excerpt}`,
    },
  ];

  let final: { drafts: Draft[]; summary: string } | null = null;

  for (let step = 0; step < MAX_STEPS && !final; step++) {
    const resp = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: step === MAX_STEPS - 1 ? { type: "function", function: { name: "finalize" } } : "auto",
      temperature: 0.2,
    });

    const choice = resp.choices[0]?.message;
    if (!choice) break;
    if (!choice.tool_calls?.length) {
      // Prose instead of a tool call — record it and push for the tool.
      if (choice.content) steps.push({ kind: "note", text: choice.content.slice(0, 600) });
      messages.push(choice);
      messages.push({ role: "user", content: "Call finalize with the reviewed list now." });
      continue;
    }

    messages.push(choice);

    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* reported back below as an empty call */
      }

      let result: unknown;
      if (call.function.name === "search_workspace") {
        const found = await searchWorkspace(args);
        steps.push({ kind: "search", query: found.query, stores: found.stores, hits: found.hits });
        result = found.payload;
      } else if (call.function.name === "finalize") {
        const done = await applyFinalize(drafts, args);
        steps.push({ kind: "finalize", kept: done.drafts.length, dropped: done.dropped });
        final = { drafts: done.drafts, summary: done.summary };
        result = { ok: true };
      } else {
        result = { error: `Unknown tool: ${call.function.name}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 6000),
      });
    }
  }

  if (!final) {
    return {
      drafts,
      trace: {
        summary: "The reviewer did not finish, so these are the raw extraction.",
        steps,
        model: CHAT_MODEL,
        at,
        completed: false,
      },
    };
  }

  return {
    drafts: final.drafts,
    trace: { summary: final.summary, steps, model: CHAT_MODEL, at, completed: true },
  };
}

async function searchWorkspace(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  const stores: Store[] = Array.isArray(args.stores)
    ? (args.stores as unknown[]).filter((s): s is Store => (STORES as readonly string[]).includes(String(s)))
    : [...STORES];
  if (!query) {
    return { query, stores, hits: [] as string[], payload: { error: "A query is required." } };
  }

  const [tickets, features, meetings, notes] = await Promise.all([
    stores.includes("tickets") ? semanticSearchTickets(query, 5).catch(() => []) : [],
    stores.includes("features") ? semanticSearchFeatures(query, 4).catch(() => []) : [],
    stores.includes("meetings") ? semanticSearchMeetings(query, 3).catch(() => []) : [],
    stores.includes("wiki") ? semanticSearchWiki(query, { limit: 3 }).catch(() => []) : [],
  ]);

  const hits = [
    ...tickets.map((t) => `#${t.number} ${t.title} (${t.status})`),
    ...features.map((f) => `Feature: ${f.title} (${f.status})`),
    ...meetings.map((m) => `Meeting: ${m.title}`),
    ...notes.map((n) => `Wiki: ${n.title}`),
  ];

  return {
    query,
    stores,
    hits,
    payload: {
      tickets: tickets.map((t) => ({ id: t.id, number: t.number, title: t.title, status: t.status })),
      features: features.map((f) => ({ id: f.id, title: f.title, status: f.status })),
      meetings: meetings.map((m) => ({ id: m.id, title: m.title, tldr: m.tldr })),
      wiki: notes.map((n) => ({ id: n.id, title: n.title })),
    },
  };
}

async function applyFinalize(drafts: Draft[], args: Record<string, unknown>) {
  const summary = String(args.summary ?? "").trim() || "Reviewed.";
  const keep = Array.isArray(args.keep) ? (args.keep as Record<string, unknown>[]) : [];
  const drop = Array.isArray(args.drop) ? (args.drop as Record<string, unknown>[]) : [];

  const used = new Set<number>();
  const kept: Draft[] = [];
  for (const item of keep) {
    const idx = Number(item.index) - 1;
    const base = drafts[idx];
    if (!base || used.has(idx)) continue;
    used.add(idx);

    const why = typeof item.why === "string" && item.why.trim() ? item.why.trim() : null;
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : base.title;
    const body = typeof item.body === "string" && item.body.trim() ? item.body.trim() : base.body;
    const existing = await resolveExisting(item.existingType, item.existingId);

    kept.push({
      ...base,
      title,
      body,
      payload: { ...base.payload, ...(why ? { why } : {}), ...(existing ? { agentMatch: true } : {}) },
      existing,
    });
  }

  const dropped: { title: string; why: string }[] = [];
  for (const item of drop) {
    const idx = Number(item.index) - 1;
    const base = drafts[idx];
    if (!base || used.has(idx)) continue;
    used.add(idx);
    dropped.push({ title: base.title, why: String(item.why ?? "").trim() || "Dropped by the reviewer." });
  }

  // Anything the reviewer forgot to mention is kept rather than lost — the
  // person can dismiss it, but silently vanishing work is the worse failure.
  drafts.forEach((d, i) => {
    if (!used.has(i)) kept.push({ ...d, payload: { ...d.payload, why: "Not reviewed — kept as extracted." } });
  });

  return { summary, drafts: kept, dropped };
}

/** Only ids that really exist become a match; the model is told never to
 *  invent one, but the check is what makes that safe. */
async function resolveExisting(
  type: unknown,
  id: unknown,
): Promise<Draft["existing"]> {
  if (typeof type !== "string" || typeof id !== "string" || !id.trim()) return null;
  const key = id.trim();
  try {
    switch (type) {
      case "ticket": {
        const t = await db.ticket.findUnique({ where: { id: key }, select: { id: true, number: true, title: true } });
        return t ? { type, id: t.id, title: `#${t.number} ${t.title}` } : null;
      }
      case "feature": {
        const f = await db.feature.findUnique({ where: { id: key }, select: { id: true, title: true } });
        return f ? { type, id: f.id, title: f.title } : null;
      }
      case "meeting": {
        const m = await db.meeting.findUnique({ where: { id: key }, select: { id: true, title: true } });
        return m ? { type, id: m.id, title: m.title } : null;
      }
      case "wiki_note": {
        const n = await db.wikiNote.findUnique({ where: { id: key }, select: { id: true, title: true } });
        return n ? { type, id: n.id, title: n.title } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
