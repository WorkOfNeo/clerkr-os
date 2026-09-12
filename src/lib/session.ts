import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";
import { db } from "./db";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session;
}

/**
 * The role is read from the database rather than off the session, on purpose.
 * Better Auth only carries the fields it knows about, and a session lives for
 * 30 days — reading the row means a promotion (or a demotion) takes effect on
 * the next request rather than on the person's next sign-in.
 */
export async function roleOf(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? "MEMBER";
}

export async function isSuperadmin(userId: string) {
  return (await roleOf(userId)) === "SUPERADMIN";
}

/**
 * The gate on /admin and on every action behind it. Redirects rather than
 * throwing: a member who follows a link to /admin should land somewhere
 * useful, not on an error page. Server actions call it too — a page guard
 * alone would leave the action itself open to anyone who can POST.
 */
export async function requireSuperadmin() {
  const session = await requireSession();
  if (!(await isSuperadmin(session.user.id))) redirect("/tickets");
  return session;
}
