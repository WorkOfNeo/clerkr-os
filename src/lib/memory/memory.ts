import type { MemoryCategory, Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Reading memory back into a prompt.
 *
 * Only ACTIVE memories are injected — a proposal is a suggestion waiting on a
 * person, and letting it reach a prompt before that would mean the assistant
 * rewriting its own instructions from a sentence it may have misread.
 */

export const memorySelect = {
  id: true,
  category: true,
  status: true,
  title: true,
  content: true,
  sourceNote: true,
  timesApplied: true,
  lastAppliedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, name: true } },
} satisfies Prisma.MemorySelect;

export type MemoryRow = Prisma.MemoryGetPayload<{ select: typeof memorySelect }>;

export const MEMORY_CATEGORIES: { value: MemoryCategory; label: string; hint: string }[] = [
  { value: "PREFERENCE", label: "Preference", hint: "How you like things done — tone, format, defaults." },
  { value: "CONVENTION", label: "Convention", hint: "House rules: naming, structure, what goes where." },
  { value: "FACT", label: "Fact", hint: "Durable facts about the product, clients or stack." },
  { value: "CORRECTION", label: "Correction", hint: "“Not that, this” — learned from being corrected." },
  { value: "ROUTING", label: "Routing", hint: "Which surface a kind of note belongs on." },
];

export function categoryLabel(c: MemoryCategory): string {
  return MEMORY_CATEGORIES.find((m) => m.value === c)?.label ?? c;
}

/** Everything confirmed, grouped for the prompt. */
export async function activeMemories(): Promise<MemoryRow[]> {
  return db.memory.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    take: 120,
    select: memorySelect,
  });
}

/**
 * The block that goes into a system prompt. Grouped by category so the model
 * reads a preference as a preference and a correction as a correction, rather
 * than one flat list where everything has equal weight.
 */
export function renderMemoryBlock(memories: MemoryRow[]): string {
  if (!memories.length) return "";

  const byCategory = new Map<string, MemoryRow[]>();
  for (const m of memories) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }

  const parts = [
    "WHAT YOU'VE LEARNED ABOUT THIS TEAM — follow these unless the user says otherwise in this message:",
  ];
  for (const [category, list] of byCategory) {
    parts.push(
      `${categoryLabel(category as MemoryCategory)} —\n` +
        list.map((m) => `- ${m.content}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}

/** Count a memory as used, so a rule that always fires and is always corrected
 *  becomes visible as a number rather than a hunch. */
export async function markApplied(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.memory.updateMany({
    where: { id: { in: ids } },
    data: { timesApplied: { increment: 1 }, lastAppliedAt: new Date() },
  });
}

/** Playbooks the assistant may follow, rendered for a prompt. */
export async function activePlaybooks() {
  return db.playbook.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    take: 30,
    select: { id: true, name: true, trigger: true, body: true },
  });
}

export function renderPlaybookBlock(
  playbooks: { name: string; trigger: string; body: string }[],
): string {
  if (!playbooks.length) return "";
  return [
    "PLAYBOOKS — written procedures for specific situations. If one matches what the user just " +
      "sent, FOLLOW IT rather than working the task out again, and rather than asking questions " +
      "it already answers:",
    ...playbooks.map((p) => `### ${p.name}\nApplies when: ${p.trigger}\n${p.body}`),
  ].join("\n\n");
}
