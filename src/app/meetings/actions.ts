"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { deleteMeetingCascade } from "@/lib/meetings/delete";
import { proposeBrief } from "@/lib/meetings/structure";
import { createTicket } from "@/lib/tickets";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const createInput = z.object({
  title: z.string().min(1, "Title is required"),
  kind: z.enum(["INTERNAL", "CUSTOMER", "PROSPECT"]).default("INTERNAL"),
  meetingDate: z.string().min(1, "Date is required"),
  attendees: z.string().optional().default(""),
  transcript: z.string().min(1, "Transcript is required"),
});

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Save the meeting and, when OpenAI is configured, read the transcript straight
 * away so the page you land on already shows the proposals. Nothing but the
 * meeting row and its TL;DR is written until a card is accepted, so running
 * the model here is safe; a failure just leaves the meeting unstructured with
 * the "Propose with AI" button to try again.
 */
export async function createMeeting(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = createInput.parse(Object.fromEntries(formData.entries()));

  const slug = await uniqueSlug(slugify(parsed.title), async (candidate) =>
    Boolean(await db.meeting.findUnique({ where: { slug: candidate }, select: { id: true } })),
  );

  const attendees = parsed.attendees
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const meeting = await db.meeting.create({
    data: {
      slug,
      title: parsed.title.trim(),
      kind: parsed.kind,
      meetingDate: parseDate(parsed.meetingDate) ?? new Date(),
      attendees,
      transcript: parsed.transcript,
      authorId: session.user.id,
    },
    select: { id: true },
  });

  if (isOpenAIAvailable()) {
    try {
      await proposeBrief(meeting.id);
    } catch (err) {
      console.warn("[createMeeting] proposeBrief failed:", err);
    }
  }

  revalidatePath("/meetings");
  redirect(`/meetings/${meeting.id}`);
}

/** (Re-)read the transcript into proposals. Accepted and dismissed cards are
 *  left alone; outstanding ones are replaced. */
export async function structureMeeting(id: string): Promise<{ error?: string; proposed?: number }> {
  await requireSession();
  if (!id) throw new Error("id required");

  if (!isOpenAIAvailable()) {
    return { error: "OPENAI_API_KEY is not set. Brief extraction is disabled." };
  }

  try {
    const result = await proposeBrief(id);
    revalidatePath("/meetings");
    revalidatePath(`/meetings/${id}`);
    return { proposed: result.proposed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleActionItem(input: { id: string; done: boolean }): Promise<void> {
  await requireSession();
  if (!input.id) throw new Error("id required");
  const item = await db.actionItem.update({
    where: { id: input.id },
    data: { done: input.done },
    select: { meetingId: true },
  });
  revalidatePath(`/meetings/${item.meetingId}`);
}

export async function sendActionItemToTicket(
  actionItemId: string,
): Promise<{ slug: string }> {
  const session = await requireSession();
  if (!actionItemId) throw new Error("id required");

  const item = await db.actionItem.findUnique({
    where: { id: actionItemId },
    include: { meeting: { select: { title: true } } },
  });
  if (!item) throw new Error("Action item not found");

  // Already raised — idempotent, return the existing ticket.
  if (item.ticketId) {
    const existing = await db.ticket.findUnique({
      where: { id: item.ticketId },
      select: { slug: true },
    });
    if (existing) return existing;
  }

  const ticket = await createTicket({
    title: item.content,
    body: `From the meeting brief: **${item.meeting.title}**.`,
    reportedBy: item.assignee,
    source: "MEETING",
    authorId: session.user.id,
  });
  await db.actionItem.update({ where: { id: item.id }, data: { ticketId: ticket.id } });

  revalidatePath("/tickets");
  revalidatePath(`/meetings/${item.meetingId}`);
  return { slug: ticket.slug };
}

export async function updateSignalStatus(input: {
  id: string;
  status: "NEW" | "ALREADY_TRACKED" | "SMALL_UNIQUE";
}): Promise<void> {
  await requireSession();
  if (!input.id) throw new Error("id required");
  const signal = await db.featureSignal.update({
    where: { id: input.id },
    data: { status: input.status },
    select: { meetingId: true },
  });
  revalidatePath(`/meetings/${signal.meetingId}`);
}

/** The meeting, its brief, and what it put elsewhere — features it added to
 *  the library and tickets raised from it — in one go. See lib/meetings/delete. */
export async function deleteMeeting(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await deleteMeetingCascade(id);
  revalidatePath("/meetings");
  revalidatePath("/features");
  revalidatePath("/knowledge");
  revalidatePath("/tickets");
  redirect("/meetings");
}
