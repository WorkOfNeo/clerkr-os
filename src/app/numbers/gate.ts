import { notFound, redirect } from "next/navigation";

import { getNumbersAccess, hasSession, type NumbersAccess, type NumbersScope } from "@/lib/numbers/access";

/**
 * Every /numbers page starts here. /numbers is for signed-in superadmins;
 * share links read the board at /n/<token> (src/app/n/[token]) and never come
 * here. No access: a signed-in member gets a plain refusal, anyone else the
 * sign-in page.
 */
export async function gate(scope: NumbersScope | null): Promise<NumbersAccess> {
  const access = await getNumbersAccess();
  if (!access) {
    if (await hasSession()) redirect("/numbers/no-access");
    redirect("/signin?callbackUrl=/numbers");
  }
  if (scope && !access.scopes.includes(scope)) notFound();
  return access;
}
