"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { issueResetToken, resetLink } from "@/lib/password-reset";
import { requireSuperadmin } from "@/lib/session";

// Every action here re-checks the role. Guarding only the page would leave the
// action itself open to anyone who can POST to it — a server action is a
// public endpoint with an unguessable name, not a private function.

const roleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(["MEMBER", "SUPERADMIN"]),
});

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Promote or demote someone.
 *
 * The one refusal: the last superadmin can't be demoted. /admin is the only
 * place a role can be changed, so emptying the role locks the door from the
 * inside and leaves psql as the only way back in. Demoting yourself is fine as
 * long as someone else still holds it.
 */
export async function setUserRole(formData: FormData): Promise<AdminResult> {
  await requireSuperadmin();

  const parsed = roleInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { userId, role } = parsed.data;

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!target) return { ok: false, message: "That account no longer exists." };
  if (target.role === role) {
    return { ok: true, message: `${target.email} is already ${label(role)}.` };
  }

  if (role === "MEMBER") {
    const remaining = await db.user.count({
      where: { role: "SUPERADMIN", id: { not: userId } },
    });
    if (remaining === 0) {
      return {
        ok: false,
        message:
          "That's the last superadmin. Promote someone else first, or there'd be no way back into /admin.",
      };
    }
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
  return { ok: true, message: `${target.email} is now ${label(role)}.` };
}

/**
 * Mint a one-hour reset link for someone else and hand it to the superadmin to
 * pass on. This is the recovery path for an address that can't use
 * /forgot-password — anything outside @clerkr.ai — and it works the same
 * whether or not email is configured.
 *
 * The link is shown rather than emailed on purpose: the superadmin already
 * knows how to reach the person, and this never silently depends on mail
 * working. Nobody's password is typed by anyone but its owner. (When email IS
 * configured the same link also reaches their inbox, because issuing a token
 * is what triggers the send — the page says so.)
 */
export async function mintResetLink(formData: FormData): Promise<LinkResult> {
  await requireSuperadmin();

  const userId = z.string().min(1).safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, message: "Invalid request." };

  const target = await db.user.findUnique({
    where: { id: userId.data },
    select: { email: true },
  });
  if (!target) return { ok: false, message: "That account no longer exists." };

  const token = await issueResetToken(target.email);
  if (!token) return { ok: false, message: "Couldn't issue a link for that account." };

  return { ok: true, url: resetLink(token) };
}

function label(role: "MEMBER" | "SUPERADMIN") {
  return role === "SUPERADMIN" ? "a superadmin" : "a member";
}
