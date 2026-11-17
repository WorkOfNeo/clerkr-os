import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { getSession, isSuperadmin } from "@/lib/session";

/**
 * Who may look at the numbers board, and which tabs.
 *
 * Two ways in, and only two:
 *  1. A share link — created and revoked in app.clerkr.ai, mirrored here by
 *     the worker's push (only token hashes ever arrive). The link IS the
 *     board: /n/<token> shows it, with the token staying in the path as the
 *     credential (`linkAccess`, src/app/n/[token]). Every page load and poll
 *     hashes it and looks the link up again, so a revoke or an expiry bites on
 *     the next load. There is no cookie: it used to swap the token for one and
 *     redirect to /numbers, and every way that cookie went missing (another
 *     device, a private window, a different host) ended on sign-in.
 *  2. A signed-in SUPERADMIN at /numbers, who sees every tab. A signed-in
 *     MEMBER does not: revenue is narrower than the rest of this single-tenant
 *     tool.
 *
 * A token grants the board and nothing else — the rest of the app still asks
 * for a Better Auth session (src/proxy.ts).
 */

export const NUMBERS_SCOPES = ["product", "website", "revenue"] as const;
export type NumbersScope = (typeof NUMBERS_SCOPES)[number];

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

/** What a share-link token opens: its live link's scopes, or null. */
export async function linkAccess(token: string | undefined | null): Promise<NumbersAccess | null> {
  const link = await findLiveLink(token);
  if (!link) return null;
  const scopes = asScopes(link.scopes);
  return scopes.length > 0 ? { kind: "link", scopes, linkId: link.id, label: link.label } : null;
}

/** /numbers: a signed-in superadmin, or nobody. Share links read the board at /n/<token>. */
export async function getNumbersAccess(): Promise<NumbersAccess | null> {
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
