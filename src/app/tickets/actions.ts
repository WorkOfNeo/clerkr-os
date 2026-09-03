"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { attachImages } from "@/lib/attachments";
import { addComment, createTicket, tryEmbedTicket } from "@/lib/tickets";
import { TICKET_PRIORITY_ORDER, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";

const statusEnum = z.enum(TICKET_STATUS_ORDER as [string, ...string[]]);
const priorityEnum = z.enum(TICKET_PRIORITY_ORDER as [string, ...string[]]);

const attachmentSchema = z.object({
  dataUrl: z.string().min(1),
  fileName: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const createInput = z.object({
  title: z.string().trim().min(1, "Give it a title"),
  body: z.string().optional(),
  categoryId: z.string().optional(),
  priority: priorityEnum.optional(),
  reportedBy: z.string().optional(),
  attachments: z.array(attachmentSchema).max(8).optional(),
});

export async function createTicketAction(
  input: z.infer<typeof createInput>,
): Promise<{ slug: string }> {
  const session = await requireSession();
  const parsed = createInput.parse(input);

  const ticket = await createTicket({
    title: parsed.title,
    body: parsed.body,
    categoryId: parsed.categoryId || null,
    priority: parsed.priority as never,
    reportedBy: parsed.reportedBy,
    source: "MANUAL",
    authorId: session.user.id,
    attachments: parsed.attachments,
  });

  revalidatePath("/tickets");
  return { slug: ticket.slug };
}

const updateInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  body: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  reportedBy: z.string().nullable().optional(),
});

export async function updateTicket(input: z.infer<typeof updateInput>): Promise<void> {
  await requireSession();
  const { id, ...rest } = updateInput.parse(input);

  const { TICKET_STATUSES } = await import("@/lib/ticket-meta");
  const resolving =
    rest.status !== undefined
      ? TICKET_STATUSES[rest.status as keyof typeof TICKET_STATUSES].resolved
      : undefined;

  const ticket = await db.ticket.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.body !== undefined ? { body: rest.body } : {}),
      ...(rest.categoryId !== undefined ? { categoryId: rest.categoryId } : {}),
      ...(rest.status !== undefined ? { status: rest.status as never } : {}),
      ...(rest.priority !== undefined ? { priority: rest.priority as never } : {}),
      ...(rest.reportedBy !== undefined ? { reportedBy: rest.reportedBy } : {}),
      // Stamp when it stopped needing attention; clear it if it's reopened.
      ...(resolving === true ? { resolvedAt: new Date() } : {}),
      ...(resolving === false ? { resolvedAt: null } : {}),
    },
    select: { id: true, slug: true, title: true, body: true },
  });

  if ((rest.title !== undefined || rest.body !== undefined) && isOpenAIAvailable()) {
    await tryEmbedTicket(ticket.id, ticket.title, ticket.body);
  }

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticket.slug}`);
}

const commentInput = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1, "Write something"),
  attachments: z.array(attachmentSchema).max(8).optional(),
  // Optional one-shot status change, so "fixed in 1.4" + marking it fixed is
  // a single action rather than two.
  status: statusEnum.optional(),
});

export async function commentOnTicket(input: z.infer<typeof commentInput>): Promise<void> {
  const session = await requireSession();
  const parsed = commentInput.parse(input);

  await addComment({
    ticketId: parsed.ticketId,
    body: parsed.body,
    authorId: session.user.id,
    source: "MANUAL",
    attachments: parsed.attachments,
  });

  if (parsed.status) {
    await updateTicket({ id: parsed.ticketId, status: parsed.status });
  }

  const ticket = await db.ticket.findUnique({
    where: { id: parsed.ticketId },
    select: { slug: true },
  });
  revalidatePath("/tickets");
  if (ticket) revalidatePath(`/tickets/${ticket.slug}`);
}

/** Attach more screenshots to a ticket after the fact. */
export async function addTicketAttachments(
  ticketId: string,
  attachments: z.infer<typeof attachmentSchema>[],
): Promise<void> {
  const session = await requireSession();
  const parsed = z.array(attachmentSchema).max(8).parse(attachments);
  await attachImages(parsed, { kind: "ticket", id: ticketId }, session.user.id);

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { slug: true } });
  if (ticket) revalidatePath(`/tickets/${ticket.slug}`);
}

export async function deleteAttachment(id: string): Promise<void> {
  await requireSession();
  const att = await db.attachment.findUnique({
    where: { id },
    select: { ticket: { select: { slug: true } }, comment: { select: { ticket: { select: { slug: true } } } } },
  });
  await db.attachment.delete({ where: { id } });
  const slug = att?.ticket?.slug ?? att?.comment?.ticket?.slug;
  if (slug) revalidatePath(`/tickets/${slug}`);
}

export async function deleteComment(id: string): Promise<void> {
  await requireSession();
  const comment = await db.ticketComment.findUnique({
    where: { id },
    select: { ticket: { select: { slug: true } } },
  });
  await db.ticketComment.delete({ where: { id } });
  if (comment) revalidatePath(`/tickets/${comment.ticket.slug}`);
}

export async function deleteTicket(id: string): Promise<void> {
  await requireSession();
  await db.actionItem.updateMany({ where: { ticketId: id }, data: { ticketId: null } });
  await db.chatSession.updateMany({ where: { ticketId: id }, data: { ticketId: null } });
  await db.ticket.delete({ where: { id } });
  revalidatePath("/tickets");
  redirect("/tickets");
}
