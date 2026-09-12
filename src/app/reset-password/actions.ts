"use server";

import { APIError } from "better-auth/api";
import { z } from "zod";

import { auth } from "@/lib/auth";

const input = z.object({
  token: z.string().trim().min(1, "This link is missing its token."),
  password: z
    .string()
    .min(12, "Use at least 12 characters — this is the only thing guarding the account.")
    .max(128, "That's longer than 128 characters."),
});

export type ResetResult = { ok: true } | { ok: false; message: string };

/**
 * Step two: spend the token and set the new password.
 *
 * Better Auth owns the whole operation — it checks the token hasn't expired,
 * hashes with the same bcrypt config as sign-up, deletes the token so a link
 * works exactly once, and (via `revokeSessionsOnPasswordReset`) drops every
 * session the account had. No password hashing happens in this app's own code.
 */
export async function setNewPassword(formData: FormData): Promise<ResetResult> {
  const parsed = input.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
    });
  } catch (e) {
    if (e instanceof APIError) {
      return {
        ok: false,
        message:
          e.body?.message ??
          "That link is no longer valid. Ask for a new one.",
      };
    }
    throw e;
  }

  return { ok: true };
}
