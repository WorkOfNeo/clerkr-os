"use server";

import { revalidatePath } from "next/cache";

import { issueApiToken, revokeApiToken } from "@/lib/api-tokens";
import { requireSession } from "@/lib/session";

export type CreateTokenState =
  | { status: "idle" }
  | { status: "success"; raw: string; name: string }
  | { status: "error"; message: string };

export async function createToken(
  _prev: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Name is required." };
  try {
    const { raw } = await issueApiToken(session.user.id, name);
    revalidatePath("/settings");
    return { status: "success", raw, name };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to create token.",
    };
  }
}

export async function revokeToken(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");
  await revokeApiToken(session.user.id, id);
  revalidatePath("/settings");
}
