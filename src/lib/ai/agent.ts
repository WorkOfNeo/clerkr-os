import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

import { db } from "@/lib/db";
import { activeMemories, activePlaybooks, markApplied, renderMemoryBlock, renderPlaybookBlock } from "@/lib/memory/memory";

import { semanticSearchFeatures, semanticSearchMeetings, semanticSearchTickets } from "./embed-entities";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { getIntakePrompt } from "./prompts";
import { findNearest } from "./intake";
import { semanticSearchWiki } from "./wiki-search";

/**
 * One chat with tools, replacing the old two-mode split.
 *
 * The split was the problem. "Ask" could only read, so being asked to file
 * something produced "I can't add items to the Kanban board" — false about the
 * app, and the user then went three turns without anything being filed. And
 * because the old path ALWAYS ran a semantic search before answering, every
 * reply came stapled to five unrelated wiki notes whether or not they bore on
 * the question.
 *
 * Here the model decides. Searching is a tool it calls when it needs to know
 * what exists, so an answer cites something only when something was actually
 * looked up. Proposing is a tool too, so filing is a thing it DOES rather than
 * a mode the user has to have picked in advance.
 */

const MAX_STEPS = 5;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_workspace",
      description:
        "Search what already exists, by meaning. Call this when you need to know whether " +
        "something has been raised before, what was decided, or what is currently open. Do NOT " +
        "call it for small talk or when the user is plainly telling you to file something new.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What you are looking for, in plain language." },
          kinds: {
            type: "array",
            items: { type: "string", enum: ["tickets", "features", "meetings", "wiki"] },
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
      name: "get_workspace_options",
      description:
        "The exact names you must choose from when filling in a proposal: kanban boards and " +
        "their columns, and the ticket categories. Call this before proposing a ticket or a " +
        "board card so you use values that exist rather than inventing them.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose",
      description:
        "Put one or more filled-in cards in front of the user to approve. This is how anything " +
        "gets created. Fill every field you reasonably can — the card is editable, so a sensible " +
        "guess costs the user a click while a question costs a whole round trip.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  enum: ["TICKET", "KANBAN_CARD", "WIKI_NOTE", "MEETING", "FEATURE", "COMMENT"],
                },
                title: { type: "string" },
                body: { type: "string", description: "Markdown detail. Optional." },
                category: { type: "string", description: "TICKET: a category slug that exists." },
                priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
                board: { type: "string", description: "KANBAN_CARD: a board name that exists." },
                column: { type: "string", description: "KANBAN_CARD: a column name on that board." },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["kind", "title"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
];

export interface AgentResult {
  messageId: string;
  text: string;
  proposalMessageId: string | null;
  citedNoteIds: string[];
}

/**
 * The caller persists the user's message BEFORE calling this — so a failure
 * mid-turn never loses what someone typed. That means the history read here
 * already ends with it, and appending it again would show the model the same
 * message twice.
 */
export async function runAgentTurn(params: { sessionId: string }): Promise<AgentResult> {
  const { sessionId } = params;
  const client = getOpenAI();

  const [basePrompt, memories, playbooks, history] = await Promise.all([
    getIntakePrompt(),
    activeMemories(),
    activePlaybooks(),
    db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { role: true, content: true },
    }),
  ]);

  const system = [
    AGENT_RULES,
    basePrompt,
    renderMemoryBlock(memories),
    renderPlaybookBlock(playbooks),
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history.reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
  ];

  const citedNoteIds = new Set<string>();
  let proposalMessageId: string | null = null;
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: TOOLS,
      temperature: 0.3,
    });

    const choice = resp.choices[0]?.message;
    if (!choice) break;

    if (!choice.tool_calls?.length) {
      finalText = choice.content ?? "";
      break;
    }

    messages.push(choice);

    for (const call of choice.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* a malformed call is reported back rather than thrown */
      }

      let result: unknown;
      try {
        if (call.function.name === "search_workspace") {
          const found = await searchWorkspace(args);
          for (const id of found.noteIds) citedNoteIds.add(id);
          result = found.payload;
        } else if (call.function.name === "get_workspace_options") {
          result = await workspaceOptions();
        } else if (call.function.name === "propose") {
          // The assistant's message has to exist before proposals can hang off
          // it, so it is created on the first propose of the turn.
          if (!proposalMessageId) {
            const created = await db.chatMessage.create({
              data: { sessionId, role: "ASSISTANT", content: "" },
              select: { id: true },
            });
            proposalMessageId = created.id;
          }
          result = await savePropositions(proposalMessageId, args);
        } else {
          result = { error: `Unknown tool: ${call.function.name}` };
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 6000),
      });
    }
  }

  // The proposal message carries the assistant's words; without a proposal it
  // is an ordinary reply.
  let messageId: string;
  if (proposalMessageId) {
    await db.chatMessage.update({
      where: { id: proposalMessageId },
      data: { content: finalText, citedNoteIds: [...citedNoteIds] },
    });
    messageId = proposalMessageId;
  } else {
    const created = await db.chatMessage.create({
      data: { sessionId, role: "ASSISTANT", content: finalText, citedNoteIds: [...citedNoteIds] },
      select: { id: true },
    });
    messageId = created.id;
  }

  await db.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
  await markApplied(memories.map((m) => m.id));

  return { messageId, text: finalText, proposalMessageId, citedNoteIds: [...citedNoteIds] };
}

const AGENT_RULES = `You are Clerkr OS — one assistant with tools, not a search box and not a form.

HOW TO BEHAVE, in order of how often it matters:

1. When someone wants something recorded, RECORD IT. Call \`propose\` with the card filled in.
   You never "can't add something to the board" — proposing is exactly what you do.

2. At most ONE follow-up question, and only when proceeding would be actively WRONG rather
   than merely imperfect. Everything else you decide yourself and put on the card, because the
   card is editable and a wrong guess costs one click. "Add grocery shopping to the board" needs
   no questions at all: pick the board, pick the column, write the title, show the card.

3. Never answer a request to create something with an offer to create it. "Say the word and I'll
   file it" after being told to file it is the single worst thing you can do. If they asked, act.

4. Search only when you need to. \`search_workspace\` is for finding out whether something already
   exists or what was decided — not a reflex before every reply. If you did not need to look
   anything up, don't, and don't cite anything.

5. Call \`get_workspace_options\` before proposing a ticket or board card, so the category, board
   and column you fill in are ones that actually exist.

6. Finish by saying, in one short sentence, what you did or found. The cards speak for
   themselves — do not describe them back.`;

async function searchWorkspace(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  const kinds = Array.isArray(args.kinds) ? (args.kinds as string[]) : ["tickets", "features", "meetings", "wiki"];
  if (!query) return { payload: { error: "A query is required." }, noteIds: [] as string[] };

  const [tickets, features, meetings, notes] = await Promise.all([
    kinds.includes("tickets") ? semanticSearchTickets(query, 5).catch(() => []) : [],
    kinds.includes("features") ? semanticSearchFeatures(query, 4).catch(() => []) : [],
    kinds.includes("meetings") ? semanticSearchMeetings(query, 3).catch(() => []) : [],
    kinds.includes("wiki") ? semanticSearchWiki(query, { limit: 4 }).catch(() => []) : [],
  ]);

  return {
    noteIds: notes.map((n) => n.id),
    payload: {
      tickets: tickets.map((t) => ({ number: t.number, title: t.title, status: t.status })),
      features: features.map((f) => ({ title: f.title, status: f.status })),
      meetings: meetings.map((m) => ({ title: m.title, tldr: m.tldr })),
      wiki: notes.map((n) => ({ title: n.title, excerpt: n.body.slice(0, 300) })),
    },
  };
}

async function workspaceOptions() {
  const [boards, categories] = await Promise.all([
    db.kanbanBoard.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        name: true,
        isDefault: true,
        columns: { orderBy: { sortOrder: "asc" }, select: { name: true, isDone: true } },
      },
    }),
    db.ticketCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
  ]);
  return { boards, ticketCategories: categories };
}

/** Turn the model's proposals into rows the UI renders as approvable cards. */
async function savePropositions(messageId: string, args: Record<string, unknown>) {
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) return { created: 0, note: "No items given." };

  const KINDS = ["TICKET", "KANBAN_CARD", "WIKI_NOTE", "MEETING", "FEATURE", "COMMENT"];
  const existing = await db.intakeProposal.count({ where: { messageId } });

  let created = 0;
  for (const raw of items.slice(0, 12)) {
    const item = raw as Record<string, unknown>;
    const kind = String(item.kind ?? "").toUpperCase();
    const title = String(item.title ?? "").trim();
    if (!KINDS.includes(kind) || !title) continue;

    const body = item.body ? String(item.body) : null;
    const match = await findNearest(kind as never, `${title}\n\n${body ?? ""}`);

    const { kind: _k, title: _t, body: _b, ...payload } = item;
    await db.intakeProposal.create({
      data: {
        messageId,
        kind: kind as never,
        order: existing + created,
        title: title.slice(0, 300),
        body,
        payload: payload as never,
        matchType: match?.type ?? null,
        matchId: match?.id ?? null,
        matchTitle: match?.title ?? null,
        matchScore: match?.score ?? null,
      },
    });
    created++;
  }

  return { created, note: "Shown to the user as cards awaiting approval. Do not describe them back." };
}
