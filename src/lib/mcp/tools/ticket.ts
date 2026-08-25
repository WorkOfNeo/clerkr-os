import { z } from "zod";

import { semanticSearchTickets } from "@/lib/ai/embed-entities";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import {
  TICKET_PRIORITY_ORDER,
  TICKET_STATUSES,
  TICKET_STATUS_ORDER,
  statusVocabulary,
} from "@/lib/ticket-meta";
import {
  addComment,
  createTicket,
  resolveCategoryId,
  resolveTicket,
  ticketDetailSelect,
  ticketListSelect,
  tryEmbedTicket,
} from "@/lib/tickets";

import type { ToolDef } from "./types";

// Tickets are the main thing Claude writes here. The descriptions lean hard on
// "search before you file" — a duplicate ticket is worse than no ticket, and
// semantic search makes checking cheap.

const statusEnum = z.enum(TICKET_STATUS_ORDER as [string, ...string[]]);
const priorityEnum = z.enum(TICKET_PRIORITY_ORDER as [string, ...string[]]);

export const TICKET_TOOLS: ToolDef[] = [
  {
    name: "create_ticket",
    description:
      "Raise a ticket in Clerkr OS — a bug, an idea, a feature request, a question. Search first with search_tickets: if something close already exists, comment on that instead of filing a duplicate. The category is one of the editable rows from list_ticket_categories (pass its slug or label); ask rather than guessing when it's genuinely ambiguous.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "One line. What is it?" },
        body: {
          type: "string",
          description:
            "Markdown. For a bug: what happened, what was expected, how to reproduce.",
        },
        category: {
          type: "string",
          description: "Category slug or label, e.g. 'bug' or 'Feature request'.",
        },
        priority: { type: "string", enum: TICKET_PRIORITY_ORDER },
        status: { type: "string", enum: TICKET_STATUS_ORDER, description: statusVocabulary() },
        reportedBy: {
          type: "string",
          description:
            "Who it actually came from, when that isn't the token owner — a teammate, or a lawyer at a customer firm.",
        },
      },
      required: ["title"],
    },
    handler: async (args, ctx) => {
      const input = z
        .object({
          title: z.string().min(1),
          body: z.string().optional(),
          category: z.string().optional(),
          priority: priorityEnum.optional(),
          status: statusEnum.optional(),
          reportedBy: z.string().optional(),
        })
        .parse(args);

      const ticket = await createTicket({
        title: input.title,
        body: input.body,
        category: input.category,
        priority: input.priority as never,
        status: input.status as never,
        reportedBy: input.reportedBy,
        source: "MCP",
        authorId: ctx.userId,
      });
      return {
        id: ticket.id,
        number: ticket.number,
        slug: ticket.slug,
        title: ticket.title,
        status: ticket.status,
      };
    },
  },
  {
    name: "list_tickets",
    description:
      "List tickets, newest activity first. Defaults to the ones still needing attention (OPEN + IN_PROGRESS); pass status to narrow, or includeResolved to see everything.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: TICKET_STATUS_ORDER, description: statusVocabulary() },
        category: { type: "string", description: "Category slug or label." },
        includeResolved: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const input = z
        .object({
          status: statusEnum.optional(),
          category: z.string().optional(),
          includeResolved: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);

      const openOnly = TICKET_STATUS_ORDER.filter((s) => !TICKET_STATUSES[s].resolved);
      const tickets = await db.ticket.findMany({
        where: {
          ...(input.status
            ? { status: input.status as never }
            : input.includeResolved
              ? {}
              : { status: { in: openOnly as never } }),
          ...(input.category ? { category: { slug: slugify(input.category) } } : {}),
        },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
        take: input.limit ?? 50,
        select: ticketListSelect,
      });
      return { tickets, count: tickets.length };
    },
  },
  {
    name: "get_ticket",
    description: "Read one ticket in full — its detail, every comment in order, and attachments.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "Ticket id, slug or number (e.g. '14' or '#14')." },
      },
      required: ["ticket"],
    },
    handler: async (args) => {
      const { ticket: ref } = z.object({ ticket: z.string().min(1) }).parse(args);
      const { id } = await resolveTicket(ref);
      return db.ticket.findUnique({ where: { id }, select: ticketDetailSelect });
    },
  },
  {
    name: "search_tickets",
    description:
      "Semantic search over tickets — finds by meaning, not keywords. ALWAYS run this before create_ticket so the same bug isn't reported twice, and use it to answer 'did we already log this?'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = z
        .object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() })
        .parse(args);

      if (!isOpenAIAvailable()) {
        const tickets = await db.ticket.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { body: { contains: query, mode: "insensitive" } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 10,
          select: ticketListSelect,
        });
        return { tickets, count: tickets.length, mode: "keyword (OpenAI not configured)" };
      }
      const hits = await semanticSearchTickets(query, limit ?? 10);
      return { tickets: hits, count: hits.length, mode: "semantic" };
    },
  },
  {
    name: "comment_on_ticket",
    description:
      "Add a comment to a ticket — what you found, what you changed, what you still need. Pass status to move it in the same call (e.g. comment what the fix was and set FIXED).",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "Ticket id, slug or number." },
        body: { type: "string", description: "Markdown." },
        status: { type: "string", enum: TICKET_STATUS_ORDER, description: statusVocabulary() },
      },
      required: ["ticket", "body"],
    },
    handler: async (args, ctx) => {
      const input = z
        .object({
          ticket: z.string().min(1),
          body: z.string().min(1),
          status: statusEnum.optional(),
        })
        .parse(args);

      const { id, slug, number } = await resolveTicket(input.ticket);
      const comment = await addComment({
        ticketId: id,
        body: input.body,
        authorId: ctx.userId,
        source: "MCP",
      });

      if (input.status) {
        const resolved = TICKET_STATUSES[input.status as keyof typeof TICKET_STATUSES].resolved;
        await db.ticket.update({
          where: { id },
          data: {
            status: input.status as never,
            resolvedAt: resolved ? new Date() : null,
          },
        });
      }
      return { commentId: comment.id, ticket: { slug, number }, status: input.status ?? null };
    },
  },
  {
    name: "update_ticket",
    description:
      "Edit a ticket: retitle it, rewrite the detail, recategorise it, change priority, or move its status. Pass category: null to uncategorise.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "Ticket id, slug or number." },
        title: { type: "string" },
        body: { type: ["string", "null"] },
        category: { type: ["string", "null"], description: "Category slug or label, or null." },
        status: { type: "string", enum: TICKET_STATUS_ORDER, description: statusVocabulary() },
        priority: { type: "string", enum: TICKET_PRIORITY_ORDER },
        reportedBy: { type: ["string", "null"] },
      },
      required: ["ticket"],
    },
    handler: async (args) => {
      const input = z
        .object({
          ticket: z.string().min(1),
          title: z.string().min(1).optional(),
          body: z.string().nullable().optional(),
          category: z.string().nullable().optional(),
          status: statusEnum.optional(),
          priority: priorityEnum.optional(),
          reportedBy: z.string().nullable().optional(),
        })
        .parse(args);

      const { id } = await resolveTicket(input.ticket);
      let categoryId: string | null | undefined;
      if (input.category === null) categoryId = null;
      else if (input.category) categoryId = await resolveCategoryId(input.category);

      const resolved =
        input.status !== undefined
          ? TICKET_STATUSES[input.status as keyof typeof TICKET_STATUSES].resolved
          : undefined;

      const ticket = await db.ticket.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(input.status !== undefined ? { status: input.status as never } : {}),
          ...(input.priority !== undefined ? { priority: input.priority as never } : {}),
          ...(input.reportedBy !== undefined ? { reportedBy: input.reportedBy } : {}),
          ...(resolved === true ? { resolvedAt: new Date() } : {}),
          ...(resolved === false ? { resolvedAt: null } : {}),
        },
        select: ticketListSelect,
      });

      if (input.title !== undefined || input.body !== undefined) {
        await tryEmbedTicket(ticket.id, ticket.title, ticket.body);
      }
      return ticket;
    },
  },
  {
    name: "delete_ticket",
    description:
      "Permanently delete a ticket and its comments and attachments. Prefer status WONT_FIX — that keeps the record of the decision not to do it.",
    inputSchema: {
      type: "object",
      properties: { ticket: { type: "string", description: "Ticket id, slug or number." } },
      required: ["ticket"],
    },
    handler: async (args) => {
      const { ticket: ref } = z.object({ ticket: z.string().min(1) }).parse(args);
      const { id, slug, number } = await resolveTicket(ref);
      await db.actionItem.updateMany({ where: { ticketId: id }, data: { ticketId: null } });
      await db.chatSession.updateMany({ where: { ticketId: id }, data: { ticketId: null } });
      await db.ticket.delete({ where: { id } });
      return { deleted: true, slug, number };
    },
  },
  {
    name: "list_ticket_categories",
    description:
      "The ticket categories that currently exist. Call this before create_ticket so you tag with a category that's actually configured, rather than inventing one.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const categories = await db.ticketCategory.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          label: true,
          color: true,
          _count: { select: { tickets: true } },
        },
      });
      return { categories, count: categories.length };
    },
  },
  {
    name: "upsert_ticket_category",
    description:
      "Create a ticket category, or rename/recolour an existing one (matched on slug). The user can also do this at /settings/categories — don't add categories unprompted.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        color: { type: "string", description: "Hex, e.g. #38bdf8." },
        sortOrder: { type: "integer", minimum: 0 },
      },
      required: ["label"],
    },
    handler: async (args) => {
      const input = z
        .object({
          label: z.string().min(1),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          sortOrder: z.number().int().min(0).optional(),
        })
        .parse(args);

      const slug = slugify(input.label);
      return db.ticketCategory.upsert({
        where: { slug },
        update: {
          label: input.label,
          ...(input.color ? { color: input.color } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        create: {
          slug,
          label: input.label,
          color: input.color ?? "#64748b",
          sortOrder: input.sortOrder ?? 99,
        },
      });
    },
  },
];
