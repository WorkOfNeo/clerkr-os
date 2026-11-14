"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { NUMBERS_SCOPES, asScopes, hashToken, newToken } from "@/lib/numbers/access";
import { recordRevenueDay } from "@/lib/numbers/revenue";
import { requireSuperadmin } from "@/lib/session";

/**
 * Share links and revenue amounts for the numbers board. Every action calls
 * requireSuperadmin() itself: a server action is a public endpoint with an
 * unguessable name, and a page guard alone would leave it open.
 */

const EXPIRY_DAYS = { "7": 7, "90": 90, "365": 365, never: null } as const;

const CreateLink = z.object({
  label: z.string().trim().min(1, "Give the link a name").max(80),
  expiry: z.enum(["7", "90", "365", "never"]),
});

export type CreateLinkState = { ok: true; url: string; label: string } | { ok: false; error: string } | null;

function publicBase(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function createNumbersLink(_prev: CreateLinkState, formData: FormData): Promise<CreateLinkState> {
  const session = await requireSuperadmin();
  const parsed = CreateLink.safeParse({ label: formData.get("label"), expiry: formData.get("expiry") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const scopes = asScopes(formData.getAll("scopes").map(String));
  if (scopes.length === 0) return { ok: false, error: "Pick at least one tab" };

  const days = EXPIRY_DAYS[parsed.data.expiry];
  const token = newToken();
  await db.numbersLink.create({
    data: {
      label: parsed.data.label,
      tokenHash: hashToken(token),
      scopes,
      expiresAt: days == null ? null : new Date(Date.now() + days * 86_400_000),
      createdById: session.user.id,
    },
  });
  revalidatePath("/admin/numbers-links");
  return { ok: true, url: `${publicBase()}/n/${token}`, label: parsed.data.label };
}

export async function revokeNumbersLink(formData: FormData) {
  await requireSuperadmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.numbersLink.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/numbers-links");
}

const amount = z
  .string()
  .trim()
  .transform((s) => s.replace(/[.\s]/g, "").replace(",", "."))
  .refine((s) => s === "" || /^\d{1,9}(\.\d+)?$/.test(s), "Amounts are whole kroner")
  .transform((s) => (s === "" ? null : Math.round(Number(s))));

const SaveFirm = z.object({
  orgId: z.string().min(1).max(64),
  monthlyDkk: amount,
  estimateDkk: amount,
  note: z.string().trim().max(200),
});

export async function saveRevenueFirm(formData: FormData) {
  await requireSuperadmin();
  const input = SaveFirm.parse({
    orgId: formData.get("orgId"),
    monthlyDkk: String(formData.get("monthlyDkk") ?? ""),
    estimateDkk: String(formData.get("estimateDkk") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  await db.revenueFirm.update({
    where: { orgId: input.orgId },
    data: {
      onDashboard: formData.get("onDashboard") === "on",
      monthlyDkk: input.monthlyDkk,
      estimateDkk: input.estimateDkk,
      note: input.note,
    },
  });
  await recordRevenueDay();
  revalidatePath("/admin/revenue-firms");
  revalidatePath("/numbers/revenue");
}

