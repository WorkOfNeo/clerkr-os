import { z } from "zod";

import { ensureProtocol } from "@/lib/base-url";
import { db } from "@/lib/db";
import {
  boardSelect,
  cardFromTicket,
  cardSelect,
  columnSelect,
  columnsFor,
  createCard,
  defaultBoardId,
  ensureBoards,
  moveColumnTo,
  removeColumn,
  resolveBoardId,
  resolveCard,
  resolveColumnId,
  seedColumns,
  updateCardFields,
  updateColumnFields,
} from "@/lib/kanban";
import {
  addSubtasks,
  deleteSubtask,
  ledgerLinkedCards,
  progressOf,
  syncSubtasksFromLedger,
  updateSubtask,
} from "@/lib/kanban-subtasks";
import { slugify, uniqueSlug } from "@/lib/slug";
import { resolveTicket } from "@/lib/tickets";

import type { ToolDef } from "./types";

// Kanban tools. The board's columns are rows the team edits, so every tool
// takes a column by NAME as readily as by id — "In Progress" is what a human
// says, and the model shouldn't have to look up a uuid to move a card.

const idSchema = z.object({ ref: z.string().min(1) });

async function resolveFeatureId(idOrSlug: string): Promise<string> {
  const feature = await db.feature.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!feature) throw new Error(`Feature not found: ${idOrSlug}`);
  return feature.id;
}

export const KANBAN_TOOLS: ToolDef[] = [
  {
    name: "list_kanban_boards",
    description:
      "List the kanban boards. There are several — each is a separate workflow with its " +
      "own columns — so call this first and pass the right board to everything else.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const boards = await ensureBoards();
      return { boards, count: boards.length };
    },
  },

  {
    name: "create_kanban_board",
    description:
      "Create a board. It opens with the standard starter columns, which can then be " +
      "renamed. Don't create boards unprompted — a board is a whole workflow.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const input = z
        .object({ name: z.string().trim().min(1).max(80), description: z.string().optional() })
        .parse(args);
      const slug = await uniqueSlug(slugify(input.name), async (c) =>
        Boolean(await db.kanbanBoard.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const last = await db.kanbanBoard.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const board = await db.kanbanBoard.create({
        data: {
          slug,
          name: input.name,
          description: input.description ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 10,
        },
        select: boardSelect,
      });
      await seedColumns(board.id);
      return board;
    },
  },

  {
    name: "list_kanban_columns",
    description:
      "List one board's columns in order, with their card counts and which ones are " +
      "terminal (isDone). Call this before creating or moving a card so you use a column " +
      "that actually exists — columns are editable, so never assume Now/Next/Later or " +
      "To Do/Doing/Done. Omit `board` for the default board.",
    inputSchema: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name, slug or id. Defaults to the default board." },
      },
    },
    handler: async (args) => {
      const input = z.object({ board: z.string().optional() }).parse(args);
      await ensureBoards();
      const boardId = (await resolveBoardId(input.board)) ?? (await defaultBoardId());
      const columns = await columnsFor(boardId);
      return { boardId, columns, count: columns.length };
    },
  },

  {
    name: "create_kanban_column",
    description:
      "Add a column to the board. Set isDone when landing in it means the work is " +
      "finished — cards moved there get stamped complete. Don't invent columns " +
      "unprompted; the board's shape is the team's decision.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        board: { type: "string", description: "Board name, slug or id. Defaults to the default board." },
        description: { type: "string" },
        color: { type: "string", description: "Hex, e.g. '#0A84FF'." },
        isDone: { type: "boolean", description: "Landing here means finished. Default false." },
        wipLimit: { type: "integer", minimum: 1, description: "Soft ceiling on card count." },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const input = z
        .object({
          name: z.string().trim().min(1).max(60),
          board: z.string().optional(),
          description: z.string().optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          isDone: z.boolean().optional(),
          wipLimit: z.number().int().min(1).optional(),
        })
        .parse(args);

      const boardId = (await resolveBoardId(input.board)) ?? (await defaultBoardId());
      const slug = await uniqueSlug(slugify(input.name), async (c) =>
        Boolean(
          await db.kanbanColumn.findFirst({ where: { boardId, slug: c }, select: { id: true } }),
        ),
      );
      const last = await db.kanbanColumn.findFirst({
        where: { boardId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return db.kanbanColumn.create({
        data: {
          boardId,
          slug,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "#8E8E93",
          icon: "Circle",
          isDone: input.isDone ?? false,
          wipLimit: input.wipLimit ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 10,
        },
        select: columnSelect,
      });
    },
  },

  {
    name: "create_kanban_card",
    description:
      "Add a card to the board. `column` takes a name, slug or id — omit it and the card " +
      "lands in the board's default column. Optionally point it at a Feature Library entry.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        board: { type: "string", description: "Board name, slug or id. Defaults to the default board." },
        column: { type: "string", description: "Column name, slug or id. Defaults to the board's default column." },
        confidence: { type: "integer", minimum: 0, maximum: 5 },
        themeTag: { type: "string", description: "Short theme label, e.g. 'AI', 'Integrations'." },
        dueDate: { type: "string", description: "ISO date." },
        featureId: { type: "string", description: "Feature id or slug to link." },
        ticket: {
          type: "string",
          description:
            "Ticket id, slug or #number this card is the work for. To put an EXISTING " +
            "ticket on the board, prefer create_card_from_ticket — it copies the words too.",
        },
        subtasks: {
          type: "array",
          items: { type: "string" },
          description: "Checklist lines to start with, in order. The card face shows done/total.",
        },
        ledgerUrl: {
          type: "string",
          description: "A NEO Ledger master-plan share link (https://…/share/<token>) for the project this card steers.",
        },
      },
      required: ["title"],
    },
    handler: async (args) => {
      const input = z
        .object({
          title: z.string().min(1),
          description: z.string().optional(),
          board: z.string().optional(),
          column: z.string().optional(),
          confidence: z.number().int().min(0).max(5).optional(),
          themeTag: z.string().optional(),
          dueDate: z.string().optional(),
          featureId: z.string().optional(),
          ticket: z.string().optional(),
          subtasks: z.array(z.string()).max(100).optional(),
          ledgerUrl: z.string().optional(),
        })
        .parse(args);

      return createCard({
        subtasks: input.subtasks,
        ledgerUrl: input.ledgerUrl,
        title: input.title,
        description: input.description,
        board: input.board,
        column: input.column,
        confidence: input.confidence,
        themeTag: input.themeTag,
        ticketId: input.ticket ? (await resolveTicket(input.ticket)).id : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        featureId: input.featureId ? await resolveFeatureId(input.featureId) : null,
      });
    },
  },

  {
    name: "create_card_from_ticket",
    description:
      "Put an existing ticket on a board: creates a card carrying the ticket's title and " +
      "body, linked back to it. This is the bridge between the queue (what was raised) and " +
      "the board (what's being done about it). Choose the column deliberately — where it " +
      "lands is the decision being made. Sending the same ticket twice is allowed but " +
      "rarely wanted, so check list_kanban first if you're unsure.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "Ticket id, slug or #number." },
        board: { type: "string", description: "Board name, slug or id. Defaults to the default board." },
        column: { type: "string", description: "Column name, slug or id. Defaults to the board's default column." },
        includeBody: {
          type: "boolean",
          description: "Copy the ticket body into the card. Default true.",
        },
        themeTag: { type: "string" },
        dueDate: { type: "string", description: "ISO date." },
      },
      required: ["ticket"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ticket: z.string().min(1),
          board: z.string().optional(),
          column: z.string().optional(),
          includeBody: z.boolean().optional(),
          themeTag: z.string().optional(),
          dueDate: z.string().optional(),
        })
        .parse(args);

      return cardFromTicket({
        ticket: input.ticket,
        board: input.board,
        column: input.column,
        includeBody: input.includeBody,
        themeTag: input.themeTag,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      });
    },
  },

  {
    name: "update_kanban_column",
    description:
      "Rename a column or change its colour, icon, WIP limit or isDone flag. Flipping " +
      "isDone backfills the cards already in it, so the column and its contents never " +
      "disagree. The board's shape is the team's decision — only do this when asked.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Column name, slug or id." },
        board: { type: "string", description: "Scopes the lookup when two boards share a column name." },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        color: { type: "string", description: "Hex, e.g. '#0A84FF'." },
        isDone: { type: "boolean", description: "Landing here means finished." },
        wipLimit: { type: ["integer", "null"], minimum: 1 },
      },
      required: ["ref"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().min(1),
          board: z.string().optional(),
          name: z.string().trim().min(1).max(60).optional(),
          description: z.string().nullable().optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          isDone: z.boolean().optional(),
          wipLimit: z.number().int().min(1).max(999).nullable().optional(),
        })
        .parse(args);

      const boardId = input.board ? await resolveBoardId(input.board) : null;
      const columnId = await resolveColumnId(input.ref, boardId);
      if (!columnId) throw new Error(`No such kanban column: ${input.ref}`);

      const { ref: _ref, board: _board, ...patch } = input;
      return updateColumnFields(columnId, patch);
    },
  },

  {
    name: "delete_kanban_column",
    description:
      "Delete a column. Deleting a column never deletes the work in it: if it still holds " +
      "cards you must say where they go via moveCardsTo, and a board can't drop below one " +
      "column. Ask the user before removing part of their workflow.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Column name, slug or id." },
        board: { type: "string", description: "Scopes the lookup when two boards share a column name." },
        moveCardsTo: {
          type: "string",
          description: "Where the cards in it should go — required if it holds any.",
        },
      },
      required: ["ref"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().min(1),
          board: z.string().optional(),
          moveCardsTo: z.string().optional(),
        })
        .parse(args);

      const boardId = input.board ? await resolveBoardId(input.board) : null;
      const columnId = await resolveColumnId(input.ref, boardId);
      if (!columnId) throw new Error(`No such kanban column: ${input.ref}`);
      const moveTo = input.moveCardsTo ? await resolveColumnId(input.moveCardsTo, boardId) : null;

      const result = await removeColumn(columnId, moveTo);
      return { ok: true, ...result };
    },
  },

  {
    name: "move_kanban_card",
    description:
      "Move a card to another column. `ref` accepts an id, slug or #number; `column` a " +
      "name, slug or id. Appends to the end of the target column. If the target column is " +
      "marked done, the card is stamped complete automatically — don't try to set that " +
      "yourself.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number." },
        column: { type: "string", description: "Target column name, slug or id." },
      },
      required: ["ref", "column"],
    },
    handler: async (args) => {
      const input = z
        .object({ ref: z.string().min(1), column: z.string().min(1), board: z.string().optional() })
        .parse(args);
      const card = await resolveCard(input.ref);
      return updateCardFields(card.id, { column: input.column, board: input.board });
    },
  },

  {
    name: "update_kanban_card",
    description:
      "Update a card's fields (title, description, confidence 0-5, themeTag, dueDate, " +
      "blocked + blockerNote, linked feature or ticket, NEO Ledger link). Pass `column` to " +
      "move it at the same time — if that column is marked done the card is stamped " +
      "complete for you. Subtasks have their own tools (add_card_subtasks, …).",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number." },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        column: { type: "string", description: "Move it: target column name, slug or id." },
        board: { type: "string", description: "Scopes the column lookup when moving." },
        confidence: { type: "integer", minimum: 0, maximum: 5 },
        themeTag: { type: ["string", "null"] },
        dueDate: { type: ["string", "null"] },
        blocked: { type: "boolean" },
        blockerNote: { type: ["string", "null"] },
        featureId: { type: ["string", "null"], description: "Feature id or slug; null to unlink." },
        ticket: {
          type: ["string", "null"],
          description: "Ticket id, slug or #number this card is the work for; null to unlink.",
        },
        ledgerUrl: {
          type: ["string", "null"],
          description:
            "NEO Ledger master-plan share link (https://…/share/<token>); null to unlink. " +
            "Changing it forgets the Ledger project the old link resolved to.",
        },
      },
      required: ["ref"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().min(1),
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          column: z.string().optional(),
          board: z.string().optional(),
          confidence: z.number().int().min(0).max(5).optional(),
          themeTag: z.string().nullable().optional(),
          dueDate: z.string().nullable().optional(),
          blocked: z.boolean().optional(),
          blockerNote: z.string().nullable().optional(),
          featureId: z.string().nullable().optional(),
          ticket: z.string().nullable().optional(),
          ledgerUrl: z.string().nullable().optional(),
        })
        .parse(args);

      const card = await resolveCard(input.ref);
      const { ref: _ref, dueDate, featureId, ticket, ...rest } = input;

      return updateCardFields(card.id, {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(featureId !== undefined
          ? { featureId: featureId === null ? null : await resolveFeatureId(featureId) }
          : {}),
        ...(ticket !== undefined
          ? { ticketId: ticket === null ? null : (await resolveTicket(ticket)).id }
          : {}),
      });
    },
  },

  {
    name: "list_kanban",
    description:
      "List the board grouped by column, in board order, with linked features. Pass a " +
      "column name to read just that one.",
    inputSchema: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name, slug or id. Defaults to the default board." },
        column: { type: "string", description: "Optional single column, by name/slug/id." },
      },
    },
    handler: async (args) => {
      const input = z.object({ column: z.string().optional(), board: z.string().optional() }).parse(args);
      await ensureBoards();
      const boardId = (await resolveBoardId(input.board)) ?? (await defaultBoardId());
      const columns = await columnsFor(boardId);
      const only = input.column ? await resolveColumnId(input.column, boardId) : null;

      const cards = await db.kanbanCard.findMany({
        where: only ? { columnId: only } : { column: { boardId } },
        orderBy: { order: "asc" },
        select: cardSelect,
      });

      const board = columns
        .filter((c) => !only || c.id === only)
        .map((c) => ({
          column: { id: c.id, name: c.name, isDone: c.isDone, wipLimit: c.wipLimit },
          cards: cards.filter((card) => card.columnId === c.id),
        }));
      return { board, count: cards.length };
    },
  },

  {
    name: "delete_kanban_card",
    description:
      "Delete a card. The linked feature, if any, stays in the library. Prefer moving it " +
      "to a terminal column over deleting — that keeps the record of the decision.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string", description: "Card id, slug or #number." } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = idSchema.parse(args);
      const card = await resolveCard(ref);
      await db.kanbanCard.delete({ where: { id: card.id } });
      return { ok: true, id: card.id, title: card.title };
    },
  },
  {
    name: "move_kanban_column",
    description:
      "Move a column to a position on its board (1 = leftmost). This is how the board's " +
      "left-to-right order changes — the same thing dragging a column header does. " +
      "Reorder only when asked: the order of the workflow is the team's.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Column name, slug or id." },
        board: { type: "string", description: "Board name, slug or id — scopes the column lookup." },
        position: { type: "integer", minimum: 1, description: "1-based; past the end means last." },
      },
      required: ["ref", "position"],
    },
    handler: async (args) => {
      const input = z
        .object({ ref: z.string().min(1), board: z.string().optional(), position: z.number().int().min(1) })
        .parse(args);
      const boardId = input.board ? await resolveBoardId(input.board) : null;
      const columnId = await resolveColumnId(input.ref, boardId);
      if (!columnId) throw new Error(`No such kanban column: ${input.ref}`);
      const { order } = await moveColumnTo(columnId, input.position);
      return { ok: true, order };
    },
  },

  {
    name: "get_kanban_card",
    description:
      "Read one card in full: its markdown note, subtasks (with ids, done state and the " +
      "NEO Ledger id each mirrors, if linked), progress, column, board and NEO Ledger link.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string", description: "Card id, slug or #number." } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = idSchema.parse(args);
      const found = await resolveCard(ref);
      const card = await db.kanbanCard.findUniqueOrThrow({
        where: { id: found.id },
        select: {
          ...cardSelect,
          column: { select: { name: true, isDone: true, board: { select: { name: true, slug: true } } } },
        },
      });
      const path = `/kanban/cards/${card.slug}`;
      const origin = ensureProtocol(process.env.BETTER_AUTH_URL);
      return {
        ...card,
        ref: `#${card.number}`,
        url: origin ? `${origin}${path}` : path,
        progress: progressOf(card.subtasks),
      };
    },
  },

  {
    name: "add_card_subtasks",
    description:
      "Append subtasks to a card's checklist, in order. The card face shows done/total, " +
      "which is how the board reads as project progress. Pass `ledgerRef` when a line " +
      "mirrors a known NEO Ledger plan item or task, so later syncs match it by id.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number." },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              done: { type: "boolean" },
              ledgerRef: { type: "string", description: "NEO Ledger plan item id or task id." },
            },
            required: ["title"],
          },
        },
      },
      required: ["ref", "subtasks"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().min(1),
          subtasks: z
            .array(
              z.object({
                title: z.string().min(1).max(500),
                done: z.boolean().optional(),
                ledgerRef: z.string().optional(),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(args);
      const card = await resolveCard(input.ref);
      const added = await addSubtasks(card.id, input.subtasks);
      return { ok: true, card: `#${card.number}`, added };
    },
  },

  {
    name: "update_card_subtask",
    description:
      "Tick, untick, rename or re-link one subtask by id (ids come from get_kanban_card). " +
      "`ledgerRef: null` forgets which NEO Ledger item it mirrors.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Subtask id." },
        title: { type: "string" },
        done: { type: "boolean" },
        ledgerRef: { type: ["string", "null"] },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = z
        .object({
          id: z.string().min(1),
          title: z.string().min(1).max(500).optional(),
          done: z.boolean().optional(),
          ledgerRef: z.string().nullable().optional(),
        })
        .parse(args);
      const { id, ...patch } = input;
      return updateSubtask(id, patch);
    },
  },

  {
    name: "delete_card_subtask",
    description: "Remove one subtask from a card's checklist, by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Subtask id." } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      return { ok: true, ...(await deleteSubtask(id)) };
    },
  },

  {
    name: "list_ledger_linked_cards",
    description:
      "Every card that carries a NEO Ledger plan link, with its subtasks, progress, the " +
      "Ledger project id it resolved to (null until its first sync) and when it was last " +
      "synced. Where a sync pass starts.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const cards = await ledgerLinkedCards();
      return { cards, count: cards.length };
    },
  },

  {
    name: "sync_card_from_ledger",
    description:
      "Mirror NEO Ledger progress onto a card's subtasks. ONE WAY — Ledger → Clerkr OS; " +
      "nothing here writes to the Ledger, and you must not mark Ledger tasks done to make " +
      "the two agree.\n\n" +
      "How to run it with the NEO Ledger MCP:\n" +
      "1. get_kanban_card (or list_ledger_linked_cards) for the card's ledgerUrl and " +
      "ledgerProjectId.\n" +
      "2. Read the plan with NEO Ledger's get_plan — by ledgerProjectId when it is set. " +
      "When it's null, the share token can't be looked up directly: find the project whose " +
      "get_plan shareUrl ends in the same /share/<token> as ledgerUrl (ask the user which " +
      "project if you can't tell), and pass its projectId here as ledgerProjectId so the " +
      "next sync doesn't have to search.\n" +
      "3. Flatten every phase's items AND their subItems into `items`: ref = item.id, " +
      "taskId = item.ledgerTask?.id, title = item.title, taskTitle = item.ledgerTask?.title, " +
      "done = item.done OR item.ledgerTask.status === 'DONE'. For a project with no plan, " +
      "use its tasks from find_task instead (ref = task id).\n\n" +
      "Subtasks match by the Ledger id they remember first, then by title (case, spacing and " +
      "punctuation ignored); a title match remembers the id. Matching subtasks are TICKED " +
      "when the Ledger says done, never unticked — ones ticked here but open in the Ledger " +
      "come back under doneHereOpenInLedger for you to mention. createMissing adds a subtask " +
      "per unmatched Ledger item (backfilling a card from its plan); leave it off when the " +
      "user wrote the subtasks themselves, and report notOnCard instead.\n\n" +
      "Omit `ref` to tick already-linked subtasks across ALL cards — e.g. right after " +
      "finishing a Ledger task, pass just that task (ref = its id, done = true). Without a " +
      "card only remembered ids match, never titles.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Card id, slug or #number. Omit for the id-only, all-cards mode." },
        ledgerProjectId: {
          type: "string",
          description: "The NEO Ledger project the card's link resolved to — remembered on the card.",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref: { type: "string", description: "Plan item id (or task id when there is no plan)." },
              taskId: { type: "string", description: "The Ledger task the plan item links, if any." },
              title: { type: "string" },
              taskTitle: { type: "string", description: "The linked task's own title." },
              done: { type: "boolean" },
            },
            required: ["ref", "title", "done"],
          },
        },
        createMissing: {
          type: "boolean",
          description: "Add a subtask for each Ledger item no subtask matched. Default false.",
        },
      },
      required: ["items"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ref: z.string().optional(),
          ledgerProjectId: z.string().optional(),
          items: z
            .array(
              z.object({
                ref: z.string().min(1),
                taskId: z.string().nullable().optional(),
                title: z.string().min(1),
                taskTitle: z.string().nullable().optional(),
                done: z.boolean(),
              }),
            )
            .max(1000),
          createMissing: z.boolean().optional(),
        })
        .parse(args);

      if (!input.ref && input.createMissing) {
        throw new Error("createMissing needs a card — pass `ref` for the card to add them to.");
      }
      const card = input.ref ? await resolveCard(input.ref) : null;
      return syncSubtasksFromLedger({
        cardId: card?.id ?? null,
        ledgerProjectId: input.ledgerProjectId,
        items: input.items,
        createMissing: input.createMissing,
      });
    },
  },
];
