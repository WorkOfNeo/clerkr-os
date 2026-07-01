"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const moveSchema = z.object({
  id: z.string().min(1),
  statusId: z.string().min(1),
  sprintId: z.string().nullable().optional(),
  order: z.number().int(),
});

function dateOrNull(v: FormDataEntryValue | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function decimalOrNull(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createTask(formData: FormData): Promise<{ slug: string }> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const statusId = String(formData.get("statusId") ?? "").trim();
  if (!statusId) {
    const first = await db.taskStatus.findFirst({ orderBy: { sortOrder: "asc" } });
    if (!first) throw new Error("No statuses configured");
  }

  const resolvedStatusId =
    statusId ||
    (await db.taskStatus.findFirstOrThrow({ orderBy: { sortOrder: "asc" } })).id;
  const sprintRaw = formData.get("sprintId");
  const sprintId =
    sprintRaw === null || sprintRaw === "" ? null : String(sprintRaw);
  const groupRaw = formData.get("groupId");
  const groupId = !groupRaw ? null : String(groupRaw);
  const stackRaw = formData.get("stackId");
  const stackId = !stackRaw ? null : String(stackRaw);

  const slug = await uniqueSlug(slugify(name), async (s) =>
    Boolean(await db.task.findUnique({ where: { slug: s }, select: { id: true } })),
  );

  const last = await db.task.findFirst({
    where: { statusId: resolvedStatusId, sprintId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? 0) + 1000;

  const task = await db.task.create({
    data: {
      name,
      slug,
      description: String(formData.get("description") ?? "") || null,
      statusId: resolvedStatusId,
      sprintId,
      groupId,
      stackId,
      dueDate: dateOrNull(formData.get("dueDate")),
      plannedDate: dateOrNull(formData.get("plannedDate")),
      estimatedHours: decimalOrNull(formData.get("estimatedHours")),
      loggedHours: decimalOrNull(formData.get("loggedHours")),
      priority: (formData.get("priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM",
      order,
      authorId: session.user.id,
    },
    select: { slug: true },
  });

  revalidatePath("/tasks");
  if (sprintId) {
    const sprint = await db.sprint.findUnique({ where: { id: sprintId }, select: { slug: true } });
    if (sprint) revalidatePath(`/sprints/${sprint.slug}`);
  }
  return task;
}

export async function updateTask(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  const data: Record<string, unknown> = {};
  const name = formData.get("name");
  if (name !== null) data.name = String(name);
  if (formData.has("description")) data.description = String(formData.get("description") ?? "") || null;
  if (formData.has("statusId")) data.statusId = String(formData.get("statusId"));
  if (formData.has("sprintId")) {
    const v = formData.get("sprintId");
    data.sprintId = !v ? null : String(v);
  }
  if (formData.has("groupId")) {
    const v = formData.get("groupId");
    data.groupId = !v ? null : String(v);
  }
  if (formData.has("stackId")) {
    const v = formData.get("stackId");
    data.stackId = !v ? null : String(v);
  }
  if (formData.has("dueDate")) data.dueDate = dateOrNull(formData.get("dueDate"));
  if (formData.has("plannedDate")) data.plannedDate = dateOrNull(formData.get("plannedDate"));
  if (formData.has("estimatedHours")) data.estimatedHours = decimalOrNull(formData.get("estimatedHours"));
  if (formData.has("loggedHours")) data.loggedHours = decimalOrNull(formData.get("loggedHours"));
  if (formData.has("priority")) data.priority = String(formData.get("priority"));

  const task = await db.task.update({ where: { id }, data, select: { slug: true, sprintId: true } });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${task.slug}`);
  if (task.sprintId) {
    const sprint = await db.sprint.findUnique({ where: { id: task.sprintId }, select: { slug: true } });
    if (sprint) revalidatePath(`/sprints/${sprint.slug}`);
  }
}

export async function deleteTask(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.task.delete({ where: { id } });
  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function moveTask(input: {
  id: string;
  statusId: string;
  sprintId: string | null;
  order: number;
}): Promise<void> {
  await requireSession();
  const parsed = moveSchema.parse(input);
  await db.task.update({
    where: { id: parsed.id },
    data: {
      statusId: parsed.statusId,
      sprintId: parsed.sprintId ?? null,
      order: parsed.order,
    },
  });
  revalidatePath("/tasks");
}

export async function assignTask(taskId: string, email: string): Promise<void> {
  await requireSession();
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!user) throw new Error(`User not found: ${email}`);
  await db.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId: user.id } },
    create: { taskId, userId: user.id },
    update: {},
  });
  revalidatePath("/tasks");
  const task = await db.task.findUnique({ where: { id: taskId }, select: { slug: true } });
  if (task) revalidatePath(`/tasks/${task.slug}`);
}

export async function unassignTask(taskId: string, email: string): Promise<void> {
  await requireSession();
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!user) return;
  await db.taskAssignee.deleteMany({ where: { taskId, userId: user.id } });
  revalidatePath("/tasks");
  const task = await db.task.findUnique({ where: { id: taskId }, select: { slug: true } });
  if (task) revalidatePath(`/tasks/${task.slug}`);
}

export async function addBlocker(blockedId: string, blockerId: string): Promise<void> {
  await requireSession();
  if (blockerId === blockedId) throw new Error("A task can't block itself");
  await db.taskBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
  revalidatePath("/tasks");
}

export async function removeBlocker(blockedId: string, blockerId: string): Promise<void> {
  await requireSession();
  await db.taskBlock.deleteMany({ where: { blockerId, blockedId } });
  revalidatePath("/tasks");
}

export async function logHours(id: string, hours: number): Promise<void> {
  await requireSession();
  await db.task.update({
    where: { id },
    data: { loggedHours: { increment: hours } },
  });
  const task = await db.task.findUnique({ where: { id }, select: { slug: true } });
  if (task) revalidatePath(`/tasks/${task.slug}`);
  revalidatePath("/tasks");
}

export async function archiveTask(id: string): Promise<void> {
  await requireSession();
  await db.task.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/tasks");
}

export async function unarchiveTask(id: string): Promise<void> {
  await requireSession();
  await db.task.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/tasks");
}
