"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify } from "@/lib/slug";

// Ticket categories are editable rows rather than an enum so a new type can be
// added from the app without a deploy. Slug is the stable key — renaming the
// label keeps every ticket already filed under it.

const upsertInput = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Name is required"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #38bdf8"),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function upsertCategory(formData: FormData): Promise<void> {
  await requireSession();
  const input = upsertInput.parse(Object.fromEntries(formData.entries()));

  if (input.id) {
    await db.ticketCategory.update({
      where: { id: input.id },
      data: {
        label: input.label,
        color: input.color,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  } else {
    const last = await db.ticketCategory.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await db.ticketCategory.create({
      data: {
        label: input.label,
        slug: slugify(input.label),
        color: input.color,
        sortOrder: input.sortOrder ?? (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  revalidatePath("/settings/categories");
  revalidatePath("/tickets");
}

export async function deleteCategory(id: string): Promise<void> {
  await requireSession();
  // Tickets filed under it survive and become uncategorised (FK is SetNull) —
  // deleting a label must never delete the reports.
  await db.ticketCategory.delete({ where: { id } });
  revalidatePath("/settings/categories");
  revalidatePath("/tickets");
}

/** Persist a drag-reorder. Order is the array position, renumbered from 0. */
export async function reorderCategories(ids: string[]): Promise<void> {
  await requireSession();
  const parsed = z.array(z.string().min(1)).parse(ids);
  await db.$transaction(
    parsed.map((id, i) =>
      db.ticketCategory.update({ where: { id }, data: { sortOrder: i } }),
    ),
  );
  revalidatePath("/settings/categories");
  revalidatePath("/tickets");
}
