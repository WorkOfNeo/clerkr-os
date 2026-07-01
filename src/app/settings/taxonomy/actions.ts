"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

const upsertSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code"),
  sortOrder: z.coerce.number().int().optional(),
  isDone: z.coerce.boolean().optional(),
});

const kindSchema = z.enum(["status", "group", "stack"]);

export async function upsertTaxonomy(kind: "status" | "group" | "stack", formData: FormData) {
  await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const input = upsertSchema.parse(raw);
  const sortOrder = input.sortOrder ?? 0;

  if (kind === "status") {
    if (input.id) {
      await db.taskStatus.update({
        where: { id: input.id },
        data: { label: input.label, color: input.color, sortOrder, isDone: input.isDone ?? false },
      });
    } else {
      await db.taskStatus.create({
        data: { label: input.label, color: input.color, sortOrder, isDone: input.isDone ?? false },
      });
    }
  } else if (kind === "group") {
    if (input.id) {
      await db.taskGroup.update({
        where: { id: input.id },
        data: { label: input.label, color: input.color, sortOrder },
      });
    } else {
      await db.taskGroup.create({
        data: { label: input.label, color: input.color, sortOrder },
      });
    }
  } else {
    if (input.id) {
      await db.taskStack.update({
        where: { id: input.id },
        data: { label: input.label, color: input.color, sortOrder },
      });
    } else {
      await db.taskStack.create({
        data: { label: input.label, color: input.color, sortOrder },
      });
    }
  }
  revalidatePath("/settings/taxonomy");
}

export async function deleteTaxonomy(kind: "status" | "group" | "stack", id: string) {
  await requireSession();
  kindSchema.parse(kind);
  if (!id) throw new Error("id required");

  if (kind === "status") {
    const count = await db.task.count({ where: { statusId: id } });
    if (count > 0) {
      throw new Error(`Cannot delete: ${count} task(s) still use this status.`);
    }
    await db.taskStatus.delete({ where: { id } });
  } else if (kind === "group") {
    const count = await db.task.count({ where: { groupId: id } });
    if (count > 0) {
      throw new Error(`Cannot delete: ${count} task(s) still use this group.`);
    }
    await db.taskGroup.delete({ where: { id } });
  } else {
    const count = await db.task.count({ where: { stackId: id } });
    if (count > 0) {
      throw new Error(`Cannot delete: ${count} task(s) still use this stack.`);
    }
    await db.taskStack.delete({ where: { id } });
  }
  revalidatePath("/settings/taxonomy");
}

export async function reorderTaxonomy(
  kind: "status" | "group" | "stack",
  orderedIds: string[],
) {
  await requireSession();
  kindSchema.parse(kind);

  if (kind === "status") {
    await db.$transaction(
      orderedIds.map((id, sortOrder) =>
        db.taskStatus.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  } else if (kind === "group") {
    await db.$transaction(
      orderedIds.map((id, sortOrder) =>
        db.taskGroup.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  } else {
    await db.$transaction(
      orderedIds.map((id, sortOrder) =>
        db.taskStack.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }
  revalidatePath("/settings/taxonomy");
}
