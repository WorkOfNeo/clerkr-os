import type { Prisma, TicketSource } from "@prisma/client";

import { embedTicket } from "@/lib/ai/embed-entities";
import { attachImages, attachmentSelect } from "@/lib/attachments";
import { db } from "@/lib/db";
import type { ImageAttachmentInput } from "@/lib/images/decode-data-url";
import { slugify, uniqueSlug } from "@/lib/slug";

// The single write path for tickets. Server actions and MCP tools both funnel
// through here so slugging, embedding, attachments and provenance behave the
// same however a ticket arrives.
//
// Embedding is best-effort on every write — a failure is logged and left to the
// sweep in src/lib/ai/embed-sweep.ts. Losing a vector must never lose a ticket.

export interface CreateTicketInput {
  title: string;
  body?: string | null;
  categoryId?: string | null;
  category?: string | null; // slug or label — resolved for MCP callers
  status?: Prisma.TicketCreateInput["status"];
  priority?: Prisma.TicketCreateInput["priority"];
  reportedBy?: string | null;
  source?: TicketSource;
  authorId: string;
  attachments?: ImageAttachmentInput[];
}

export async function createTicket(input: CreateTicketInput) {
  const slug = await uniqueSlug(slugify(input.title), async (c) =>
    Boolean(await db.ticket.findUnique({ where: { slug: c }, select: { id: true } })),
  );

  const categoryId = input.categoryId ?? (await resolveCategoryId(input.category));

  const ticket = await db.ticket.create({
    data: {
      slug,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      categoryId,
      status: input.status ?? "OPEN",
      priority: input.priority ?? "MEDIUM",
      reportedBy: input.reportedBy?.trim() || null,
      source: input.source ?? "MANUAL",
      authorId: input.authorId,
    },
  });

  await attachImages(input.attachments, { kind: "ticket", id: ticket.id }, input.authorId);
  await tryEmbedTicket(ticket.id, ticket.title, ticket.body);
  return ticket;
}

export async function tryEmbedTicket(
  id: string,
  title: string,
  body: string | null,
): Promise<void> {
  try {
    await embedTicket(id, title, body ?? "");
  } catch (err) {
    console.warn("[tickets] embedTicket failed:", err);
  }
}

export interface AddCommentInput {
  ticketId: string;
  body: string;
  authorId: string;
  source?: TicketSource;
  attachments?: ImageAttachmentInput[];
}

export async function addComment(input: AddCommentInput) {
  const comment = await db.ticketComment.create({
    data: {
      ticketId: input.ticketId,
      body: input.body.trim(),
      authorId: input.authorId,
      source: input.source ?? "MANUAL",
    },
  });

  await attachImages(input.attachments, { kind: "comment", id: comment.id }, input.authorId);

  // Touch the ticket so the list sorts by real activity.
  await db.ticket.update({ where: { id: input.ticketId }, data: { updatedAt: new Date() } });
  return comment;
}

/** Resolve a category by slug or label — MCP callers pass whichever they have. */
export async function resolveCategoryId(ref?: string | null): Promise<string | null> {
  if (!ref?.trim()) return null;
  const needle = ref.trim();
  const category = await db.ticketCategory.findFirst({
    where: {
      OR: [
        { id: needle },
        { slug: slugify(needle) },
        { label: { equals: needle, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!category) throw new Error(`No such ticket category: ${ref}`);
  return category.id;
}

/** Resolve a ticket by id, slug or #number. */
export async function resolveTicket(ref: string) {
  const asNumber = Number(String(ref).replace(/^#/, ""));
  const ticket = await db.ticket.findFirst({
    where: {
      OR: [
        { id: ref },
        { slug: ref },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
      ],
    },
    select: { id: true, slug: true, number: true, title: true, status: true },
  });
  if (!ticket) throw new Error(`Ticket not found: ${ref}`);
  return ticket;
}

// `attachmentSelect` lives in lib/attachments.ts now that every surface uses
// it; re-exported here so existing ticket imports keep working.
export { attachmentSelect };

export const ticketListSelect = {
  id: true,
  slug: true,
  number: true,
  title: true,
  body: true,
  status: true,
  priority: true,
  reportedBy: true,
  source: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, label: true, color: true } },
  author: { select: { id: true, email: true, name: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TicketSelect;

export const ticketDetailSelect = {
  ...ticketListSelect,
  attachments: { select: attachmentSelect },
  comments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      source: true,
      createdAt: true,
      author: { select: { id: true, email: true, name: true } },
      attachments: { select: attachmentSelect },
    },
  },
} satisfies Prisma.TicketSelect;
