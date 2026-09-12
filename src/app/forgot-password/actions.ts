"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  isResetEligible,
  issueResetToken,
  normalizeEmail,
  resetMode,
  resetPath,
  RESET_DOMAIN,
  takeDelivery,
} from "@/lib/password-reset";

const input = z.object({
  email: z.string().trim().min(1, "Enter your email").email("That isn't an email address"),
});

export type ForgotResult =
  /** Email mode: a link is on its way (or the address simply doesn't exist). */
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * Step one of a reset. Deliberately unauthenticated — the whole point is that
 * the person can't sign in.
 *
 * In `email` mode the answer is the same whether or not the address exists, so
 * this form can't be used to enumerate accounts. In `direct` mode it can't be
 * — there is no mail, so a real address must be answered with the form and an
 * unknown one with a refusal. That difference is inherent to resetting without
 * confirmation and is one more reason it's a stopgap; see `password-reset.ts`.
 */
export async function requestReset(formData: FormData): Promise<ForgotResult> {
  const parsed = input.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { kind: "error", message: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isResetEligible(email)) {
    return {
      kind: "error",
      message: `Only @${RESET_DOMAIN} addresses can reset their own password. Ask a superadmin for a link.`,
    };
  }

  const token = await issueResetToken(email);
  const mode = resetMode();

  if (mode === "direct") {
    if (!token) {
      return { kind: "error", message: "No account here uses that address." };
    }
    takeDelivery(token); // nothing was sent; clear the channel

    // Redirected from the server rather than pushed from the client: a
    // `router.push` issued right after an action resolves races the RSC
    // re-render the action itself triggers, and loses — the URL changes on the
    // server and the browser stays put. `redirect` is part of the action's own
    // response, so there is nothing to race.
    redirect(resetPath(token));
  }

  // No such user: answer exactly as if there were, and send nothing.
  if (!token) return { kind: "sent" };

  const delivery = takeDelivery(token);
  if (delivery && !delivery.sent && delivery.reason === "failed") {
    // Saying "check your inbox" when the send was refused wastes someone's
    // afternoon. Say what actually happened instead.
    return {
      kind: "error",
      message: `The email couldn't be sent: ${delivery.error}`,
    };
  }

  return { kind: "sent" };
}
