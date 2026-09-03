"use server";

import { revalidatePath } from "next/cache";

import { PROMPT_KEYS } from "@/lib/ai/prompts";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

// Derived from PROMPT_KEYS rather than listed by hand — the hand-written
// version had drifted and silently rejected saves to the triage prompt, which
// the page had been rendering an editor for the whole time.
const VALID_KEYS: string[] = Object.values(PROMPT_KEYS);

export async function savePrompt(formData: FormData): Promise<void> {
  await requireSession();
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!VALID_KEYS.includes(key)) throw new Error(`Unknown setting key: ${key}`);

  await db.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  revalidatePath("/settings/prompts");
}

export async function resetPrompt(key: string): Promise<void> {
  await requireSession();
  if (!VALID_KEYS.includes(key)) throw new Error(`Unknown setting key: ${key}`);
  // Deleting the row makes the code default take over again.
  await db.appSetting.deleteMany({ where: { key } });
  revalidatePath("/settings/prompts");
}
