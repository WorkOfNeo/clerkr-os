"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { listTags, verifyApiKey, type PocketTag } from "@/lib/pocket/client";
import { importRecording, readImportedMeeting, syncPocket } from "@/lib/pocket/sync";
import { requireSession } from "@/lib/session";

// A connection is keyed on the Pocket account email, so re-saving the same
// email replaces the key in place — that is how rotation works, with no
// separate flow.
//
// Note what saving does NOT do: it does not start syncing. A new connection
// has no tags, and no tags means nothing is fetched. Choosing which tags mean
// "this belongs in Clerkr OS" is a deliberate second step, because the wrong
// default here pulls in every conversation the person records.

const connectionInput = z.object({
  label: z.string().trim().min(1, "Give the connection a name."),
  pocketEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email address."),
  apiKey: z.string().trim().min(8, "Paste the API key from Pocket."),
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

  // Check the key against Pocket before storing it. A key that doesn't work is
  // worth saying so now, rather than as a silent empty sync in ten minutes.
  const check = await verifyApiKey(input.apiKey);
  if (!check.ok) return { status: "error", message: check.message };

  const existing = await db.pocketConnection.findUnique({
    where: { pocketEmail: input.pocketEmail },
    select: { id: true },
  });

  await db.pocketConnection.upsert({
    where: { pocketEmail: input.pocketEmail },
    create: {
      label: input.label,
      pocketEmail: input.pocketEmail,
      apiKey: input.apiKey,
      userId: input.userId,
      defaultKind: input.defaultKind,
    },
    update: {
      label: input.label,
      apiKey: input.apiKey,
      userId: input.userId,
      defaultKind: input.defaultKind,
      lastError: null,
      active: true,
    },
  });

  revalidatePath("/settings/pocket");
  return { status: "saved", label: input.label, rotated: Boolean(existing) };
}

/** Tags on the connected account, for the picker. */
export async function fetchTags(
  connectionId: string,
): Promise<{ tags: PocketTag[] } | { error: string }> {
  await requireSession();
  const conn = await db.pocketConnection.findUnique({
    where: { id: connectionId },
    select: { apiKey: true },
  });
  if (!conn) return { error: "Connection not found." };

  try {
    return { tags: await listTags(conn.apiKey) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach Pocket." };
  }
}

/** Which tags mean "file this here". Empty is valid and means nothing syncs. */
export async function setConnectionTags(connectionId: string, tagIds: string[]): Promise<void> {
  await requireSession();
  const ids = z.array(z.string().min(1)).parse(tagIds);
  await db.pocketConnection.update({
    where: { id: connectionId },
    data: { tagIds: ids, lastError: null },
  });
  revalidatePath("/settings/pocket");
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
 * Remove a connection. Meetings it already imported stay exactly where they
 * are — they are the record of a conversation, not an artefact of the sync.
 */
export async function deleteConnection(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");
  await db.pocketConnection.delete({ where: { id } });
  revalidatePath("/settings/pocket");
}

/** Run the poll now rather than waiting for the timer. */
export async function syncNow(): Promise<{ imported: number; seen: number; error?: string }> {
  await requireSession();
  const results = await syncPocket();
  revalidatePath("/settings/pocket");
  revalidatePath("/meetings");
  return {
    imported: results.reduce((n, r) => n + r.imported, 0),
    seen: results.reduce((n, r) => n + r.seen, 0),
    error: results.find((r) => r.error)?.error,
  };
}

/** Import one recording chosen by hand on the browse page. */
export async function importOne(
  connectionId: string,
  recordingId: string,
): Promise<{ meetingId?: string; status: string; error?: string }> {
  await requireSession();

  const conn = await db.pocketConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, defaultKind: true, apiKey: true },
  });
  if (!conn) return { status: "error", error: "Connection not found." };

  try {
    const result = await importRecording({ connection: conn, recordingId });
    if (result.status === "created" && result.meetingId) {
      await readImportedMeeting(result.meetingId);
    }
    revalidatePath("/settings/pocket/browse");
    revalidatePath("/meetings");
    return { status: result.status, meetingId: result.meetingId };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
