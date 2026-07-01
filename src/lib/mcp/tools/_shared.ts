import { z } from "zod";

import { db } from "@/lib/db";

export const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

export function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(v)}`);
  return d;
}

export async function resolveUserId(emailOrId: string): Promise<string> {
  if (emailOrId.includes("@")) {
    const u = await db.user.findUnique({
      where: { email: emailOrId.toLowerCase() },
      select: { id: true },
    });
    if (!u) throw new Error(`User not found: ${emailOrId}`);
    return u.id;
  }
  return emailOrId;
}
