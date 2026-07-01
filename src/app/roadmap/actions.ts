"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const laneEnum = z.enum(["NOW", "NEXT", "LATER"]);

function intOrNull(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : Number.isFinite(n) ? Math.round(n) : null;
}

function clampConfidence(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

export async function createRoadmapItem(formData: FormData): Promise<void> {
  await requireSession();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");

  const lane = laneEnum.catch("LATER").parse(formData.get("lane") ?? "LATER");
  const description = String(formData.get("description") ?? "").trim() || null;
  const themeTag = String(formData.get("themeTag") ?? "").trim() || null;
  const confidence = clampConfidence(intOrNull(formData.get("confidence")));
  const featureRaw = formData.get("featureId");
  const featureId = !featureRaw ? null : String(featureRaw);

  const slug = await uniqueSlug(slugify(title), async (s) =>
    Boolean(
      await db.roadmapItem.findUnique({ where: { slug: s }, select: { id: true } }),
    ),
  );

  const last = await db.roadmapItem.findFirst({
    where: { lane },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? 0) + 1000;

  await db.roadmapItem.create({
    data: {
      slug,
      title,
      description,
      lane,
      order,
      confidence,
      themeTag,
      featureId,
    },
  });

  revalidatePath("/roadmap");
}

const moveSchema = z.object({
  id: z.string().min(1),
  lane: laneEnum,
  order: z.number().int(),
});

export async function moveRoadmapItem(input: {
  id: string;
  lane: "NOW" | "NEXT" | "LATER";
  order: number;
}): Promise<void> {
  await requireSession();
  const parsed = moveSchema.parse(input);
  await db.roadmapItem.update({
    where: { id: parsed.id },
    data: { lane: parsed.lane, order: parsed.order },
  });
  revalidatePath("/roadmap");
}

export async function updateRoadmapItem(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");

  const data: Record<string, unknown> = {};
  if (formData.has("title")) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) throw new Error("Title is required");
    data.title = title;
  }
  if (formData.has("description"))
    data.description = String(formData.get("description") ?? "").trim() || null;
  if (formData.has("themeTag"))
    data.themeTag = String(formData.get("themeTag") ?? "").trim() || null;
  if (formData.has("confidence"))
    data.confidence = clampConfidence(intOrNull(formData.get("confidence")));
  if (formData.has("blocked"))
    data.blocked = formData.get("blocked") === "on" || formData.get("blocked") === "true";
  if (formData.has("blockerNote"))
    data.blockerNote = String(formData.get("blockerNote") ?? "").trim() || null;
  if (formData.has("featureId")) {
    const v = formData.get("featureId");
    data.featureId = !v ? null : String(v);
  }

  await db.roadmapItem.update({ where: { id }, data });
  revalidatePath("/roadmap");
}

const confidenceSchema = z.object({
  id: z.string().min(1),
  confidence: z.number().int().min(0).max(5),
});

export async function setConfidence(input: {
  id: string;
  confidence: number;
}): Promise<void> {
  await requireSession();
  const parsed = confidenceSchema.parse({
    id: input.id,
    confidence: clampConfidence(input.confidence),
  });
  await db.roadmapItem.update({
    where: { id: parsed.id },
    data: { confidence: parsed.confidence },
  });
  revalidatePath("/roadmap");
}

const toggleBlockedSchema = z.object({
  id: z.string().min(1),
  blocked: z.boolean(),
  blockerNote: z.string().nullable().optional(),
});

export async function toggleBlocked(input: {
  id: string;
  blocked: boolean;
  blockerNote?: string;
}): Promise<void> {
  await requireSession();
  const parsed = toggleBlockedSchema.parse(input);
  await db.roadmapItem.update({
    where: { id: parsed.id },
    data: {
      blocked: parsed.blocked,
      blockerNote: parsed.blocked ? (parsed.blockerNote?.trim() || null) : null,
    },
  });
  revalidatePath("/roadmap");
}

const linkSchema = z.object({
  id: z.string().min(1),
  featureId: z.string().min(1).nullable(),
});

export async function linkRoadmapToFeature(input: {
  id: string;
  featureId: string | null;
}): Promise<void> {
  await requireSession();
  const parsed = linkSchema.parse(input);
  await db.roadmapItem.update({
    where: { id: parsed.id },
    data: { featureId: parsed.featureId },
  });
  revalidatePath("/roadmap");
}

export async function deleteRoadmapItem(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.roadmapItem.delete({ where: { id } });
  revalidatePath("/roadmap");
}
