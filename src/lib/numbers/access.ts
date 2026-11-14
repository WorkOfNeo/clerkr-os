import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { getSession, isSuperadmin } from "@/lib/session";

/**
 * Who may look at /numbers, and which tabs.
 *
 * Two ways in, and only two:
 *  1. A share link — created and revoked in app.clerkr.ai, mirrored here by
 *     the worker's push (only token hashes ever arrive). `/n/<token>` swaps the token for an httpOnly cookie scoped
 *     to /numbers and redirects, so the token is in the address bar for one
 *     request only. The cookie holds the same token; every page load hashes it
 *     and looks the link up again, so a revoke or an expiry bites on the next
 *     load, not when the cookie runs out.
 *  2. A signed-in SUPERADMIN, who sees every tab. A signed-in MEMBER does not:
 *     revenue is narrower than the rest of this single-tenant tool.
 *
 * The cookie is path-scoped to /numbers and grants nothing anywhere else — the
 * rest of the app still asks for a Better Auth session (src/proxy.ts).
 */

export const NUMBERS_SCOPES = ["product", "website", "revenue"] as const;
export type NumbersScope = (typeof NUMBERS_SCOPES)[number];

export const NUMBERS_COOKIE = "numbers_link";
export const NUMBERS_COOKIE_PATH = "/numbers";

export type NumbersAccess =
  | { kind: "superadmin"; scopes: NumbersScope[] }
  | { kind: "link"; scopes: NumbersScope[]; linkId: string; label: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function asScopes(values: readonly string[]): NumbersScope[] {
  return NUMBERS_SCOPES.filter((s) => values.includes(s));
}

/** The live link a token belongs to, or null when unknown, revoked or expired. */
export async function findLiveLink(token: string | undefined | null) {
  if (!token || !TOKEN_SHAPE.test(token)) return null;
  const link = await db.numbersLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null;
  return link;
}

/** Records that a link was used. Best-effort: a failed write never blocks the board. */
export async function touchLink(id: string) {
  await db.numbersLink.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
}

export async function getNumbersAccess(): Promise<NumbersAccess | null> {
  const token = (await cookies()).get(NUMBERS_COOKIE)?.value;
  const link = await findLiveLink(token);
  if (link) {
    const scopes = asScopes(link.scopes);
    if (scopes.length > 0) return { kind: "link", scopes, linkId: link.id, label: link.label };
  }

  const session = await getSession();
  if (session && (await isSuperadmin(session.user.id))) {
    return { kind: "superadmin", scopes: [...NUMBERS_SCOPES] };
  }
  return null;
}

/** Whether a signed-in person (of any role) is looking — decides the no-access message. */
export async function hasSession(): Promise<boolean> {
  return Boolean(await getSession());
}
