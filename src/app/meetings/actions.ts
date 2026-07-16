"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { runStructurePipeline } from "@/lib/meetings/structure";
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

  revalidatePath("/meetings");
  redirect(`/meetings/${meeting.id}`);
}

export async function structureMeeting(id: string): Promise<{ error?: string }> {
  await requireSession();
  if (!id) throw new Error("id required");

  if (!isOpenAIAvailable()) {
    return { error: "OPENAI_API_KEY is not set. Brief extraction is disabled." };
  }

  try {
    await runStructurePipeline(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  revalidatePath("/features");
  revalidatePath("/knowledge");
  return {};
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

export async function sendActionItemToTask(actionItemId: string): Promise<{ slug: string }> {
  const session = await requireSession();
  if (!actionItemId) throw new Error("id required");

  const item = await db.actionItem.findUnique({ where: { id: actionItemId } });
  if (!item) throw new Error("Action item not found");

  // Already pushed — return the existing task.
  if (item.taskId) {
    const existing = await db.task.findUnique({
      where: { id: item.taskId },
      select: { slug: true },
    });
    if (existing) return existing;
  }

  const status = await db.taskStatus.findFirst({ orderBy: { sortOrder: "asc" } });
  if (!status) throw new Error("No task statuses configured yet — run npm run db:seed first.");

  const slug = await uniqueSlug(slugify(item.content), async (s) =>
    Boolean(await db.task.findUnique({ where: { slug: s }, select: { id: true } })),
  );
  const last = await db.task.findFirst({
    where: { statusId: status.id, sprintId: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? 0) + 1000;

  const task = await db.task.create({
    data: {
      name: item.content,
      slug,
      statusId: status.id,
      dueDate: item.dueDate,
      order,
      authorId: session.user.id,
      sourceMeetingId: item.meetingId,
    },
    select: { id: true, slug: true },
  });

  await db.actionItem.update({ where: { id: item.id }, data: { taskId: task.id } });

  revalidatePath("/tasks");
  revalidatePath(`/meetings/${item.meetingId}`);
  return { slug: task.slug };
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

export async function deleteMeeting(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.meeting.delete({ where: { id } });
  revalidatePath("/meetings");
  redirect("/meetings");
}
