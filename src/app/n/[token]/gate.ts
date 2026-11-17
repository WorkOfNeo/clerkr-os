import { notFound } from "next/navigation";

import { linkAccess, touchLink, type NumbersScope } from "@/lib/numbers/access";

/**
 * A share link's gate: the token in the path, and nothing else.
 *
 * The link IS the board. It used to swap the token for a cookie and redirect
 * to /numbers, and that hop is what kept landing people on sign-in — a private
 * window, another device, a bookmark of /numbers, or a redirect to a different
 * host than the one the link was opened on all arrive with no cookie. So no
 * cookie, no session and never a redirect to /signin: the URL works wherever
 * it's opened, every time. An unknown, revoked or expired token gets null and
 * the page draws the dead end. A tab outside the link's scopes is a 404.
 */
export async function linkGate(token: string, scope: NumbersScope | null): Promise<NumbersScope[] | null> {
  const access = await linkAccess(token);
  if (!access || access.kind !== "link") return null;
  if (scope && !access.scopes.includes(scope)) notFound();
  await touchLink(access.linkId);
  return access.scopes;
}
