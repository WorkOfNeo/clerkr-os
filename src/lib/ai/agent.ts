import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

import { db } from "@/lib/db";
import {
  boardsWithColumns,
  cardFromTicket,
  cardsForTicket,
  columnsFor,
  defaultBoardId,
  removeColumn,
  resolveBoardId,
  resolveCard,
  resolveColumnId,
  updateCardFields,
  updateColumnFields,
} from "@/lib/kanban";
import { activeMemories, activePlaybooks, markApplied, renderMemoryBlock, renderPlaybookBlock } from "@/lib/memory/memory";
import { slugify, uniqueSlug } from "@/lib/slug";

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

// Enough for read → act → say what happened, with room for a correction. The
// board tools made turns genuinely multi-step: tidying up means looking first.
const MAX_STEPS = 8;

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
  {
    type: "function",
    function: {
      name: "read_board",
      description:
        "Read a kanban board: its columns in order and the cards in each, with the #numbers " +
        "the user can see. Call this before changing anything on the board, so you act on a " +
        "card that exists and can refer to it the way they do.",
      parameters: {
        type: "object",
        properties: {
          board: { type: "string", description: "Board name. Omit for the default board." },
          column: { type: "string", description: "Just this one column." },
          includeDone: {
            type: "boolean",
            description: "Include cards sitting in done columns. Default false — they pile up.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_card",
      description:
        "Change a card that already exists: retitle it, rewrite its notes, set or clear a due " +
        "date, mark it blocked, or move it to another column by passing `column`. Moving is " +
        "how work progresses — a card landing in a done column is stamped complete for you. " +
        "This never creates anything; use `propose` for that.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "The card's #number, slug or id." },
          title: { type: "string" },
          description: { type: ["string", "null"], description: "Markdown notes. Replaces what's there." },
          column: { type: "string", description: "Move it: the name of a column on its board." },
          board: { type: "string", description: "Only needed when two boards share a column name." },
          themeTag: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"], description: "ISO date, or null to clear." },
          confidence: { type: "integer", minimum: 0, maximum: 5 },
          blocked: { type: "boolean" },
          blockerNote: { type: ["string", "null"], description: "What it's waiting on." },
        },
        required: ["ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_card",
      description:
        "Delete one card, permanently. Only when the user named it and asked for it gone — " +
        "moving a card to a done column keeps the record of what happened, and is almost " +
        "always what 'clear this' or 'tidy up' actually means.",
      parameters: {
        type: "object",
        properties: { ref: { type: "string", description: "The card's #number, slug or id." } },
        required: ["ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_column",
      description:
        "Create, rename or delete a column. The board's workflow is data, so this is how it " +
        "changes shape — but the shape is the team's decision, so only when they asked. " +
        "Deleting a column never deletes the work in it: if it holds cards you must say " +
        "where they go with moveCardsTo.",
      parameters: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["create", "update", "delete"] },
          board: { type: "string", description: "Board name. Omit for the default board." },
          ref: { type: "string", description: "update/delete: the column to change, by name." },
          name: { type: "string", description: "create: the new column's name. update: rename it to this." },
          color: { type: "string", description: "Hex, e.g. '#0A84FF'." },
          isDone: {
            type: "boolean",
            description: "Landing here means finished. Cards already there are caught up.",
          },
          wipLimit: { type: ["integer", "null"], minimum: 1 },
          moveCardsTo: { type: "string", description: "delete: where the cards in it should go." },
        },
        required: ["op"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ticket_to_card",
      description:
        "Put a ticket that already exists onto a board — a card carrying its title and body, " +
        "linked back to it. This is what 'let's do #14' means: the queue is what was raised, " +
        "the board is what's being done about it. Pick the column deliberately.",
      parameters: {
        type: "object",
        properties: {
          ticket: { type: "string", description: "The ticket's #number, slug or id." },
          board: { type: "string", description: "Board name. Omit for the default board." },
          column: { type: "string", description: "Column name. Omit for the board's default column." },
          includeBody: { type: "boolean", description: "Copy the ticket's body across. Default true." },
        },
        required: ["ticket"],
      },
    },
  },
];

export interface AgentResult {
  messageId: string;
  text: string;
  proposalMessageId: string | null;
  citedNoteIds: string[];
  /** A board tool ran, so /kanban needs revalidating. */
  touchedBoard: boolean;
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
  // The board tools write straight through — the page holding it has to be
  // told, or the user's next look at /kanban is the stale cached render.
  let touchedBoard = false;

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
        } else if (BOARD_TOOLS.has(call.function.name)) {
          result = await runBoardTool(call.function.name, args);
          touchedBoard = true;
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

  return {
    messageId,
    text: finalText,
    proposalMessageId,
    citedNoteIds: [...citedNoteIds],
    touchedBoard,
  };
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

6. CREATING something is a proposal; CHANGING something that already exists is not. A card
   the user can see is a thing they can point at, so "move 12 to done", "rename #7",
   "that one's blocked on legal" are done with \`update_card\` there and then — asking
   permission to do what you were just told to do is the same failure as rule 3. Read the
   board first with \`read_board\` so you act on the right card and can name it by number.

7. Deleting is different from moving. \`delete_card\` is permanent and is only for a card the
   user named and asked to be rid of; "tidy this up" or "clear the done column" means MOVE
   them, which keeps the record of what happened. Never delete more than they named, and
   never delete to make a board look neater on your own initiative.

8. The board's shape belongs to the team. \`manage_column\` is there for when they ask for a
   column — don't reorganise a workflow because it looks untidy to you. Deleting a column
   that still holds cards needs somewhere for them to go.

9. Finish by saying, in one short sentence, what you did or found. The cards speak for
   themselves — do not describe them back.`;

// ─── The board tools ─────────────────────────────────────────────────────────
//
// These WRITE, immediately, unlike `propose`. That's the line: a card invented
// out of a paste is a guess and goes through a card the user approves, but a
// card that already exists is a thing they can see, and being told "shall I
// move #12 to Done?" after saying "move 12 to done" is the failure this whole
// surface exists to remove.
//
// Every one of them goes through lib/kanban, so the assistant edits the board
// by exactly the same path as the card panel and MCP — the completedAt stamp,
// the column-delete refusal and the sparse ordering all behave identically
// however the change arrived.

const BOARD_TOOLS = new Set([
  "read_board",
  "update_card",
  "delete_card",
  "manage_column",
  "ticket_to_card",
]);

/** Cards are returned by #number — the handle the user can actually see. */
function cardLine(card: {
  number: number;
  title: string;
  blocked: boolean;
  dueDate: Date | null;
  ticket: { number: number } | null;
}) {
  return {
    ref: `#${card.number}`,
    title: card.title,
    ...(card.blocked ? { blocked: true } : {}),
    ...(card.dueDate ? { due: card.dueDate.toISOString().slice(0, 10) } : {}),
    ...(card.ticket ? { fromTicket: `#${card.ticket.number}` } : {}),
  };
}

async function runBoardTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const str = (k: string) => {
    const v = args[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const bool = (k: string) => (typeof args[k] === "boolean" ? (args[k] as boolean) : undefined);

  switch (name) {
    case "read_board": {
      const boardId = (await resolveBoardId(str("board"))) ?? (await defaultBoardId());
      const columns = await columnsFor(boardId);
      const only = str("column") ? await resolveColumnId(str("column"), boardId) : null;
      const includeDone = bool("includeDone") ?? false;

      // A done column accumulates for ever, so it is listed with its count but
      // its cards are left out until asked for. Naming it explicitly counts as
      // asking.
      const visible = columns.filter((c) => !only || c.id === only);
      const listed = visible.filter((c) => includeDone || Boolean(only) || !c.isDone);

      const cards = await db.kanbanCard.findMany({
        where: { columnId: { in: listed.map((c) => c.id) } },
        orderBy: { order: "asc" },
        take: 150,
        select: {
          number: true,
          title: true,
          blocked: true,
          dueDate: true,
          columnId: true,
          ticket: { select: { number: true } },
        },
      });

      const withheld = visible.filter((c) => !listed.includes(c));
      return {
        columns: visible.map((c) => ({
          name: c.name,
          isDone: c.isDone,
          wipLimit: c.wipLimit,
          cardCount: c._count.cards,
          ...(listed.includes(c)
            ? { cards: cards.filter((card) => card.columnId === c.id).map(cardLine) }
            : {}),
        })),
        ...(withheld.length
          ? {
              note:
                `Cards in ${withheld.map((c) => c.name).join(", ")} are counted but not listed — ` +
                "call again with includeDone if you need them.",
            }
          : {}),
      };
    }

    case "update_card": {
      const ref = str("ref");
      if (!ref) return { error: "Which card? Pass its #number." };
      const card = await resolveCard(ref);
      const dueDate = args.dueDate;

      const updated = await updateCardFields(card.id, {
        title: str("title"),
        ...(args.description !== undefined ? { description: str("description") ?? null } : {}),
        column: str("column"),
        board: str("board"),
        ...(args.themeTag !== undefined ? { themeTag: str("themeTag") ?? null } : {}),
        ...(dueDate !== undefined
          ? { dueDate: typeof dueDate === "string" && dueDate ? new Date(dueDate) : null }
          : {}),
        ...(typeof args.confidence === "number" ? { confidence: args.confidence } : {}),
        ...(bool("blocked") !== undefined ? { blocked: bool("blocked") } : {}),
        ...(args.blockerNote !== undefined ? { blockerNote: str("blockerNote") ?? null } : {}),
      });

      const column = await db.kanbanColumn.findUnique({
        where: { id: updated.columnId },
        select: { name: true },
      });
      return {
        ok: true,
        ref: `#${updated.number}`,
        title: updated.title,
        column: column?.name,
        done: Boolean(updated.completedAt),
      };
    }

    case "delete_card": {
      const ref = str("ref");
      if (!ref) return { error: "Which card? Pass its #number." };
      const card = await resolveCard(ref);
      await db.kanbanCard.delete({ where: { id: card.id } });
      return { ok: true, deleted: `#${card.number}`, title: card.title };
    }

    case "manage_column": {
      const op = str("op");
      const boardId = (await resolveBoardId(str("board"))) ?? (await defaultBoardId());

      if (op === "create") {
        const columnName = str("name");
        if (!columnName) return { error: "A new column needs a name." };
        const slug = await uniqueSlug(slugify(columnName), async (c) =>
          Boolean(
            await db.kanbanColumn.findFirst({ where: { boardId, slug: c }, select: { id: true } }),
          ),
        );
        const last = await db.kanbanColumn.findFirst({
          where: { boardId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const created = await db.kanbanColumn.create({
          data: {
            boardId,
            slug,
            name: columnName,
            color: str("color") ?? "#8E8E93",
            icon: "Circle",
            isDone: bool("isDone") ?? false,
            wipLimit: typeof args.wipLimit === "number" ? args.wipLimit : null,
            sortOrder: (last?.sortOrder ?? 0) + 10,
          },
          select: { name: true, isDone: true },
        });
        return { ok: true, created: created.name, isDone: created.isDone };
      }

      const ref = str("ref");
      if (!ref) return { error: "Which column? Pass its name." };
      const columnId = await resolveColumnId(ref, boardId);
      if (!columnId) return { error: `No such column: ${ref}` };

      if (op === "delete") {
        const moveTo = str("moveCardsTo")
          ? await resolveColumnId(str("moveCardsTo"), boardId)
          : null;
        const result = await removeColumn(columnId, moveTo);
        return { ok: true, deleted: result.name, movedCards: result.movedCards };
      }

      if (op === "update") {
        const column = await updateColumnFields(columnId, {
          name: str("name"),
          ...(str("color") ? { color: str("color") } : {}),
          ...(bool("isDone") !== undefined ? { isDone: bool("isDone") } : {}),
          ...(args.wipLimit !== undefined
            ? { wipLimit: typeof args.wipLimit === "number" ? args.wipLimit : null }
            : {}),
        });
        return { ok: true, column: column.name, isDone: column.isDone, wipLimit: column.wipLimit };
      }

      return { error: `Unknown op: ${op}. Use create, update or delete.` };
    }

    case "ticket_to_card": {
      const ticket = str("ticket");
      if (!ticket) return { error: "Which ticket? Pass its #number." };

      const card = await cardFromTicket({
        ticket,
        board: str("board"),
        column: str("column"),
        includeBody: bool("includeBody"),
      });
      const already = await cardsForTicket(card.ticketId ?? "");
      const column = await db.kanbanColumn.findUnique({
        where: { id: card.columnId },
        select: { name: true },
      });
      return {
        ok: true,
        ref: `#${card.number}`,
        title: card.title,
        column: column?.name,
        ...(already.length > 1
          ? { note: `That ticket now has ${already.length} cards — say so if it looks accidental.` }
          : {}),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

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
    boardsWithColumns(),
    db.ticketCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
  ]);
  return {
    boards: boards.map((b) => ({
      name: b.name,
      isDefault: b.isDefault,
      columns: b.columns.map((c) => ({ name: c.name, isDone: c.isDone })),
    })),
    ticketCategories: categories,
  };
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
