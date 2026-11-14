import { notFound, redirect } from "next/navigation";

import { getNumbersAccess, hasSession, touchLink, type NumbersAccess, type NumbersScope } from "@/lib/numbers/access";

/**
 * Every /numbers page starts here. No access: a signed-in member gets a plain
 * refusal, anyone else the sign-in page (a superadmin can always get in that
 * way). A tab outside the link's scopes is a 404 — the same answer as a page
 * that doesn't exist, so a scoped link can't tell what it's missing.
 */
export async function gate(scope: NumbersScope | null): Promise<NumbersAccess> {
  const access = await getNumbersAccess();
  if (!access) {
    if (await hasSession()) redirect("/numbers/no-access");
    redirect("/signin?callbackUrl=/numbers");
  }
  if (scope && !access.scopes.includes(scope)) notFound();
  if (access.kind === "link") await touchLink(access.linkId);
  return access;
}
