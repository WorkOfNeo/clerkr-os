"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

// A connection is keyed on the Pocket account email, so re-saving the same
// email replaces the secret in place. That is deliberately how rotation works:
// Pocket shows a signing secret once, and rotating it there should not need a
// different flow here — paste the new one over the old.

const connectionInput = z.object({
  label: z.string().trim().min(1, "Give the connection a name."),
  pocketEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email address."),
  secret: z.string().trim().min(8, "Paste the signing secret Pocket showed you."),
  userId: z.string().min(1, "Pick who meetings are filed under."),
  defaultKind: z.enum(["INTERNAL", "CUSTOMER", "PROSPECT"]).default("INTERNAL"),
});

export type SaveConnectionState =
  | { status: "idle" }
  | { status: "saved"; label: string; rotated: boolean }
  | { status: "error"; message: string };

export async function saveConnection(
  _prev: SaveConnectionState,
  formData: FormData,
): Promise<SaveConnectionState> {
  await requireSession();

  const parsed = connectionInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the fields and try again.",
    };
  }
  const input = parsed.data;

  const existing = await db.pocketConnection.findUnique({
    where: { pocketEmail: input.pocketEmail },
    select: { id: true },
  });

  await db.pocketConnection.upsert({
    where: { pocketEmail: input.pocketEmail },
    create: {
      label: input.label,
      pocketEmail: input.pocketEmail,
      secret: input.secret,
      userId: input.userId,
      defaultKind: input.defaultKind,
    },
    update: {
      label: input.label,
      secret: input.secret,
      userId: input.userId,
      defaultKind: input.defaultKind,
      // A new secret is a fresh start — an old signature failure is no longer
      // the truth about this connection.
      lastError: null,
      active: true,
    },
  });

  revalidatePath("/settings/pocket");
  return { status: "saved", label: input.label, rotated: Boolean(existing) };
}

export async function setConnectionActive(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) throw new Error("id required");

  await db.pocketConnection.update({ where: { id }, data: { active } });
  revalidatePath("/settings/pocket");
}

/**
 * Remove a connection. Meetings it already filed stay exactly where they are —
 * they are the record of a conversation, not an artefact of the integration.
 */
export async function deleteConnection(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  await db.pocketConnection.delete({ where: { id } });
  revalidatePath("/settings/pocket");
}
