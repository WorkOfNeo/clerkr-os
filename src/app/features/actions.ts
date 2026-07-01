"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const FEATURE_STATUSES = [
  "IDEA",
  "VALIDATED",
  "IN_ROADMAP",
  "SHIPPED",
  "SMALL_UNIQUE",
] as const;

const LINK_KINDS = ["RELATED", "DEPENDS_ON"] as const;

function parseTags(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// ─── Feature CRUD ──────────────────────────────────────────────────────────

const createFeatureSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  status: z.enum(FEATURE_STATUSES).default("IDEA"),
  tags: z.string().optional().nullable(),
  clusterId: z.string().optional().nullable(),
});

export async function createFeature(formData: FormData): Promise<{ slug: string }> {
  await requireSession();
  const parsed = createFeatureSchema.parse(Object.fromEntries(formData.entries()));

  const slug = await uniqueSlug(slugify(parsed.title), async (c) =>
    Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
  );

  const feature = await db.feature.create({
    data: {
      title: parsed.title.trim(),
      slug,
      description: emptyToNull(parsed.description),
      status: parsed.status,
      tags: parseTags(parsed.tags),
      clusterId: emptyToNull(parsed.clusterId),
    },
    select: { slug: true },
  });

  revalidatePath("/features");
  revalidatePath("/knowledge");
  return feature;
}

const updateFeatureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  status: z.enum(FEATURE_STATUSES),
  tags: z.string().optional().nullable(),
  clusterId: z.string().optional().nullable(),
});

export async function updateFeature(formData: FormData): Promise<{ slug: string }> {
  await requireSession();
  const parsed = updateFeatureSchema.parse(Object.fromEntries(formData.entries()));

  const feature = await db.feature.update({
    where: { id: parsed.id },
    data: {
      title: parsed.title.trim(),
      description: emptyToNull(parsed.description),
      status: parsed.status,
      tags: parseTags(parsed.tags),
      clusterId: emptyToNull(parsed.clusterId),
    },
    select: { slug: true },
  });

  revalidatePath("/features");
  revalidatePath(`/features/${feature.slug}`);
  revalidatePath("/knowledge");
  return feature;
}

const setStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(FEATURE_STATUSES),
});

export async function setFeatureStatus(input: {
  id: string;
  status: (typeof FEATURE_STATUSES)[number];
}): Promise<void> {
  await requireSession();
  const parsed = setStatusSchema.parse(input);
  const feature = await db.feature.update({
    where: { id: parsed.id },
    data: { status: parsed.status },
    select: { slug: true },
  });
  revalidatePath("/features");
  revalidatePath(`/features/${feature.slug}`);
  revalidatePath("/knowledge");
}

const assignClusterSchema = z.object({
  featureId: z.string().min(1),
  clusterId: z.string().nullable(),
});

export async function assignFeatureToCluster(input: {
  featureId: string;
  clusterId: string | null;
}): Promise<void> {
  await requireSession();
  const parsed = assignClusterSchema.parse(input);
  const feature = await db.feature.update({
    where: { id: parsed.featureId },
    data: { clusterId: parsed.clusterId },
    select: { slug: true },
  });
  revalidatePath("/features");
  revalidatePath(`/features/${feature.slug}`);
  revalidatePath("/knowledge");
}

export async function deleteFeature(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.feature.delete({ where: { id } });
  revalidatePath("/features");
  revalidatePath("/knowledge");
}

// ─── Cluster ───────────────────────────────────────────────────────────────

const createClusterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

export async function createCluster(formData: FormData): Promise<{ slug: string }> {
  await requireSession();
  const parsed = createClusterSchema.parse(Object.fromEntries(formData.entries()));

  const slug = await uniqueSlug(slugify(parsed.name), async (c) =>
    Boolean(await db.cluster.findUnique({ where: { slug: c }, select: { id: true } })),
  );

  const cluster = await db.cluster.create({
    data: {
      name: parsed.name.trim(),
      slug,
      description: emptyToNull(parsed.description),
      icon: emptyToNull(parsed.icon),
      color: emptyToNull(parsed.color),
    },
    select: { slug: true },
  });

  revalidatePath("/features");
  revalidatePath("/knowledge");
  return cluster;
}

// ─── Feature links ─────────────────────────────────────────────────────────

const linkSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.enum(LINK_KINDS).default("RELATED"),
});

export async function linkFeatures(input: {
  fromId: string;
  toId: string;
  kind: (typeof LINK_KINDS)[number];
}): Promise<void> {
  await requireSession();
  const parsed = linkSchema.parse(input);
  if (parsed.fromId === parsed.toId) throw new Error("A feature can't link to itself");

  await db.featureLink.upsert({
    where: { fromId_toId: { fromId: parsed.fromId, toId: parsed.toId } },
    create: { fromId: parsed.fromId, toId: parsed.toId, kind: parsed.kind },
    update: { kind: parsed.kind },
  });

  revalidatePath("/features");
  revalidatePath("/knowledge");
}

export async function unlinkFeatures(linkId: string): Promise<void> {
  await requireSession();
  if (!linkId) throw new Error("linkId required");
  await db.featureLink.delete({ where: { id: linkId } });
  revalidatePath("/features");
  revalidatePath("/knowledge");
}

// ─── Promote a meeting signal into a feature ──────────────────────────────

const SIGNAL_TO_FEATURE_STATUS: Record<
  "NEW" | "ALREADY_TRACKED" | "SMALL_UNIQUE",
  (typeof FEATURE_STATUSES)[number]
> = {
  NEW: "IDEA",
  ALREADY_TRACKED: "VALIDATED",
  SMALL_UNIQUE: "SMALL_UNIQUE",
};

const promoteSchema = z.object({
  signalId: z.string().min(1),
  clusterId: z.string().optional().nullable(),
});

export async function promoteSignalToFeature(input: {
  signalId: string;
  clusterId?: string | null;
}): Promise<{ slug: string }> {
  await requireSession();
  const parsed = promoteSchema.parse(input);

  const signal = await db.featureSignal.findUnique({
    where: { id: parsed.signalId },
  });
  if (!signal) throw new Error("Signal not found");

  const slug = await uniqueSlug(slugify(signal.title), async (c) =>
    Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
  );

  const feature = await db.feature.create({
    data: {
      title: signal.title,
      slug,
      description: signal.detail,
      tags: signal.tags,
      status: SIGNAL_TO_FEATURE_STATUS[signal.status],
      clusterId: emptyToNull(parsed.clusterId),
    },
    select: { id: true, slug: true },
  });

  await db.featureSignal.update({
    where: { id: signal.id },
    data: { featureId: feature.id },
  });

  revalidatePath("/features");
  revalidatePath("/knowledge");
  revalidatePath(`/meetings/${signal.meetingId}`);
  return { slug: feature.slug };
}
