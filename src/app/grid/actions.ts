"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

const updateInput = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  category: z.string().optional().nullable(),
  todo: z.string().optional().nullable(),
  painPoint: z.string().optional().nullable(),
  priority: z.coerce.number().int().min(1).max(5),
});

function emptyToNull<T>(v: T): T | null {
  return v === "" ? null : v;
}

export async function updatePost(formData: FormData) {
  await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateInput.parse(raw);
  await db.post.update({
    where: { id: parsed.id },
    data: {
      url: parsed.url,
      title: parsed.title,
      description: emptyToNull(parsed.description ?? null),
      imageUrl: emptyToNull(parsed.imageUrl ?? null),
      category: emptyToNull(parsed.category ?? null),
      todo: emptyToNull(parsed.todo ?? null),
      painPoint: emptyToNull(parsed.painPoint ?? null),
      priority: parsed.priority,
    },
  });
  revalidatePath("/grid");
}

export async function deletePost(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");
  await db.post.delete({ where: { id } });
  revalidatePath("/grid");
}
