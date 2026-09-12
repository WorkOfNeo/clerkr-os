import { ensureProtocol } from "./base-url";
import { db } from "./db";

/**
 * Forgotten-password recovery.
 *
 * Two modes, and ONE thing decides which is live — whether RESEND_API_KEY is
 * set:
 *
 * - `direct` (no key) — the reset happens on the spot. Type an @clerkr.ai
 *   address, get the new-password form, done. Nothing is emailed, nothing is
 *   confirmed.
 * - `email` (key set) — the link is emailed instead, and the inbox is the only
 *   way to the form.
 *
 * `direct` means anyone who can reach the sign-in page can take over any
 * @clerkr.ai account by typing the address. That is a deliberate, temporary
 * trade while there is no way to send mail; setting RESEND_API_KEY closes it
 * with no code change and no deploy. Every surface that can be in direct mode
 * says so out loud rather than letting it be quietly forgotten.
 */
export type ResetMode = "email" | "direct";

/** Only this domain can self-serve a reset. Everyone else asks a superadmin. */
export const RESET_DOMAIN = "clerkr.ai";

export function resetMode(): ResetMode {
  return process.env.RESEND_API_KEY?.trim() ? "email" : "direct";
}

export function isResetEligible(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${RESET_DOMAIN}`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resetPath(token: string): string {
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetLink(token: string): string {
  const origin = ensureProtocol(process.env.BETTER_AUTH_URL) ?? "http://localhost:3000";
  return `${origin}${resetPath(token)}`;
}

// ─── Delivery outcomes ──────────────────────────────────────────────────────
// Better Auth calls `sendResetPassword` through `runInBackgroundOrAwait`,
// which logs a failure and reports success to the caller regardless. That is
// the wrong answer for a screen about to say "check your inbox", so the hook
// records what actually happened here and the caller reads it back.
//
// Safe as process memory: with no background-task handler configured the hook
// is awaited, so the write lands before `requestPasswordReset` returns and the
// read happens microseconds later in the same call. The map is only a channel
// between those two points — never state anything depends on surviving.

export type Delivery =
  | { sent: true }
  | { sent: false; reason: "direct-mode" }
  | { sent: false; reason: "failed"; error: string };

const deliveries = new Map<string, { at: number; result: Delivery }>();
const DELIVERY_TTL_MS = 60_000;

export function recordDelivery(token: string, result: Delivery): void {
  const cutoff = Date.now() - DELIVERY_TTL_MS;
  for (const [k, v] of deliveries) if (v.at < cutoff) deliveries.delete(k);
  deliveries.set(token, { at: Date.now(), result });
}

/** Read-and-forget: a delivery outcome is only ever interesting once. */
export function takeDelivery(token: string): Delivery | null {
  const entry = deliveries.get(token);
  deliveries.delete(token);
  return entry?.result ?? null;
}

// ─── Issuing ────────────────────────────────────────────────────────────────

// Better Auth files a reset token as a Verification row keyed
// `reset-password:<token>` with the user id as its value. Reading the row back
// is how we get the token at all: `requestPasswordReset` only ever returns a
// neutral "if that address exists…" body, by design.
const RESET_PREFIX = "reset-password:";

/**
 * Mint a reset token for an address. Returns null when there is no such user
 * — in email mode the caller must answer identically either way, so the form
 * can't be used to find out who has an account.
 *
 * Better Auth generates the token and its one-hour expiry; we only read what
 * it wrote. The row is created before `sendResetPassword` runs, so it is
 * always there by the time this returns.
 */
export async function issueResetToken(email: string): Promise<string | null> {
  const identifier = normalizeEmail(email);
  const user = await db.user.findUnique({
    where: { email: identifier },
    select: { id: true },
  });
  if (!user) return null;

  // Imported here rather than at the top because `auth.ts` imports this module
  // for its `sendResetPassword` hook — a static import both ways is a cycle.
  const { auth } = await import("./auth");
  await auth.api.requestPasswordReset({ body: { email: identifier } });

  const verification = await db.verification.findFirst({
    where: { value: user.id, identifier: { startsWith: RESET_PREFIX } },
    orderBy: { createdAt: "desc" },
    select: { identifier: true, expiresAt: true },
  });
  if (!verification || verification.expiresAt < new Date()) return null;

  return verification.identifier.slice(RESET_PREFIX.length);
}

// ─── Sending ────────────────────────────────────────────────────────────────

/**
 * Resend's REST API directly rather than their SDK — one POST, no dependency
 * to keep pinned. Throws on a refusal so the caller can tell the truth.
 */
export async function sendResetEmail(to: string, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set.");

  const from = process.env.RESEND_FROM?.trim() || `Clerkr OS <noreply@${RESET_DOMAIN}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Clerkr OS password",
      text: [
        "Someone asked to reset the password on this Clerkr OS account.",
        "",
        "Set a new one here (the link is good for one hour):",
        link,
        "",
        "If that wasn't you, ignore this — nothing has changed.",
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend refused the send (${res.status}). ${detail}`.trim());
  }
}
