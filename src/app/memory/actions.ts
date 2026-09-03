"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { memorySelect } from "@/lib/memory/memory";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const CATEGORIES = ["PREFERENCE", "CONVENTION", "FACT", "CORRECTION", "ROUTING"] as const;

// ─── Memories ────────────────────────────────────────────────────────────────

const memoryInput = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(1, "Give it a one-line title").max(200),
  content: z.string().trim().min(1, "Say what should be remembered").max(2000),
});

export async function createMemory(input: z.infer<typeof memoryInput>) {
  const session = await requireSession();
  const parsed = memoryInput.parse(input);
  const memory = await db.memory.create({
    data: {
      ...parsed,
      // Written by a person, so it is in force immediately — the PROPOSED step
      // exists to gate what the nightly pass invents, not what you type.
      status: "ACTIVE",
      createdById: session.user.id,
    },
    select: memorySelect,
  });
  revalidatePath("/memory");
  return memory;
}

export async function updateMemory(
  input: { id: string } & Partial<z.infer<typeof memoryInput>>,
): Promise<void> {
  await requireSession();
  const { id, ...rest } = z
    .object({ id: z.string().min(1) })
    .merge(memoryInput.partial())
    .parse(input);
  await db.memory.update({ where: { id }, data: rest });
  revalidatePath("/memory");
}

/** Confirm a proposal, or put an active one back on the shelf. */
export async function setMemoryStatus(
  id: string,
  status: "PROPOSED" | "ACTIVE" | "DISMISSED",
): Promise<void> {
  await requireSession();
  await db.memory.update({ where: { id }, data: { status } });
  revalidatePath("/memory");
}

/**
 * Deleting forgets that it was ever considered, so the nightly pass is free to
 * propose the same thing again. DISMISSED is usually what you want instead —
 * it is the record of a decision.
 */
export async function deleteMemory(id: string): Promise<void> {
  await requireSession();
  await db.memory.delete({ where: { id } });
  revalidatePath("/memory");
}

export async function listMemories(status?: "PROPOSED" | "ACTIVE" | "DISMISSED") {
  await requireSession();
  return db.memory.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: memorySelect,
  });
}

// ─── Playbooks ───────────────────────────────────────────────────────────────

const playbookInput = z.object({
  name: z.string().trim().min(1, "Give the playbook a name").max(120),
  trigger: z.string().trim().min(1, "Say when it applies").max(500),
  body: z.string().trim().min(1, "Write the procedure").max(20000),
  enabled: z.boolean().optional(),
});

export async function createPlaybook(input: z.infer<typeof playbookInput>) {
  await requireSession();
  const parsed = playbookInput.parse(input);
  const slug = await uniqueSlug(slugify(parsed.name), async (c) =>
    Boolean(await db.playbook.findUnique({ where: { slug: c }, select: { id: true } })),
  );
  const playbook = await db.playbook.create({
    data: { ...parsed, slug, enabled: parsed.enabled ?? true },
  });
  revalidatePath("/memory");
  return { id: playbook.id, slug: playbook.slug, name: playbook.name };
}

export async function updatePlaybook(
  input: { id: string } & Partial<z.infer<typeof playbookInput>>,
): Promise<void> {
  await requireSession();
  const { id, ...rest } = z
    .object({ id: z.string().min(1) })
    .merge(playbookInput.partial())
    .parse(input);
  await db.playbook.update({ where: { id }, data: rest });
  revalidatePath("/memory");
}

export async function deletePlaybook(id: string): Promise<void> {
  await requireSession();
  await db.playbook.delete({ where: { id } });
  revalidatePath("/memory");
}

export async function listPlaybooks() {
  await requireSession();
  return db.playbook.findMany({ orderBy: { name: "asc" } });
}

/** Run the nightly pass now, so it can be seen working rather than trusted. */
export async function runMemoryPassNow(): Promise<{
  proposed: number;
  scanned: number;
  reason?: string;
}> {
  await requireSession();
  const { runNightlyMemoryPass } = await import("@/lib/memory/nightly");
  // Two weeks rather than a day: run by hand it is usually being tried for
  // the first time, and a button that always reports nothing looks broken.
  const result = await runNightlyMemoryPass({ lookbackHours: 24 * 14 });
  revalidatePath("/memory");
  return {
    proposed: result.proposed,
    scanned: result.scannedMessages,
    reason: result.skippedReason,
  };
}
