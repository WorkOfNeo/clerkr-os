import { z } from "zod";

import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

const LANES = ["NOW", "NEXT", "LATER"] as const;

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  lane: z.enum(LANES).optional(),
  confidence: z.number().int().min(0).max(5).optional(),
  themeTag: z.string().optional(),
  featureId: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().int().min(0).max(5).optional(),
  themeTag: z.string().nullable().optional(),
  blocked: z.boolean().optional(),
  blockerNote: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

const itemSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  lane: true,
  order: true,
  confidence: true,
  themeTag: true,
  blocked: true,
  blockerNote: true,
  createdAt: true,
  updatedAt: true,
  feature: { select: { id: true, slug: true, title: true, status: true } },
} as const;

// Sparse append-to-end ordering, mirroring the kanban pattern.
async function endOfLaneOrder(lane: (typeof LANES)[number]): Promise<number> {
  const last = await db.roadmapItem.findFirst({
    where: { lane },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? 0) + 1000;
}

// Accept a feature id or slug wherever a roadmap item points at a feature.
async function resolveFeatureId(idOrSlug: string): Promise<string> {
  const feature = await db.feature.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  if (!feature) throw new Error(`Feature not found: ${idOrSlug}`);
  return feature.id;
}

export const ROADMAP_TOOLS: ToolDef[] = [
  {
    name: "create_roadmap_item",
    description:
      "Add an item to the Now / Next / Later roadmap. Appends to the end of the lane. " +
      "Optionally point it at a Feature Library entry via featureId (id or slug).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        lane: { type: "string", enum: ["NOW", "NEXT", "LATER"], description: "Default LATER." },
        confidence: { type: "integer", minimum: 0, maximum: 5, description: "0-5 confidence meter." },
        themeTag: { type: "string", description: "Short theme label, e.g. 'AI', 'Integrations'." },
        featureId: { type: "string", description: "Feature id or slug to link." },
      },
      required: ["title"],
    },
    handler: async (args) => {
      const input = createSchema.parse(args);
      const lane = input.lane ?? "LATER";
      const slug = await uniqueSlug(slugify(input.title), async (s) =>
        Boolean(await db.roadmapItem.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const item = await db.roadmapItem.create({
        data: {
          slug,
          title: input.title.trim(),
          description: input.description ?? null,
          lane,
          order: await endOfLaneOrder(lane),
          confidence: input.confidence ?? 0,
          themeTag: input.themeTag ?? null,
          featureId: input.featureId ? await resolveFeatureId(input.featureId) : null,
        },
        select: itemSelect,
      });
      return item;
    },
  },

  {
    name: "update_roadmap_item",
    description:
      "Update a roadmap item's fields (title, description, confidence 0-5, themeTag, " +
      "blocked + blockerNote, linked feature). Use move_roadmap_item to change lanes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        confidence: { type: "integer", minimum: 0, maximum: 5 },
        themeTag: { type: ["string", "null"] },
        blocked: { type: "boolean" },
        blockerNote: { type: ["string", "null"] },
        featureId: { type: ["string", "null"], description: "Feature id or slug; null to unlink." },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.description !== undefined) data.description = input.description;
      if (input.confidence !== undefined) data.confidence = input.confidence;
      if (input.themeTag !== undefined) data.themeTag = input.themeTag;
      if (input.blocked !== undefined) {
        data.blocked = input.blocked;
        if (!input.blocked) data.blockerNote = null;
      }
      if (input.blockerNote !== undefined && input.blocked !== false) {
        data.blockerNote = input.blockerNote;
      }
      if (input.featureId !== undefined) {
        data.featureId =
          input.featureId === null ? null : await resolveFeatureId(input.featureId);
      }
      const item = await db.roadmapItem.update({
        where: { id: input.id },
        data,
        select: itemSelect,
      });
      return item;
    },
  },

  {
    name: "move_roadmap_item",
    description:
      "Move a roadmap item to another lane (NOW / NEXT / LATER). Appends to the end of the " +
      "target lane unless an explicit sparse `order` is given (mirror the kanban pattern: " +
      "midpoint between neighbours).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        lane: { type: "string", enum: ["NOW", "NEXT", "LATER"] },
        order: { type: "integer", description: "Explicit position within the lane; omit to append." },
      },
      required: ["id", "lane"],
    },
    handler: async (args) => {
      const input = z
        .object({ id: z.string().min(1), lane: z.enum(LANES), order: z.number().int().optional() })
        .parse(args);
      const item = await db.roadmapItem.update({
        where: { id: input.id },
        data: { lane: input.lane, order: input.order ?? (await endOfLaneOrder(input.lane)) },
        select: itemSelect,
      });
      return item;
    },
  },

  {
    name: "list_roadmap",
    description:
      "List roadmap items grouped by lane (NOW / NEXT / LATER), in board order, with their " +
      "linked features.",
    inputSchema: {
      type: "object",
      properties: {
        lane: { type: "string", enum: ["NOW", "NEXT", "LATER"], description: "Optional single lane." },
      },
    },
    handler: async (args) => {
      const input = z.object({ lane: z.enum(LANES).optional() }).parse(args);
      const items = await db.roadmapItem.findMany({
        where: input.lane ? { lane: input.lane } : undefined,
        orderBy: [{ lane: "asc" }, { order: "asc" }],
        select: itemSelect,
      });
      const lanes: Record<string, typeof items> = { NOW: [], NEXT: [], LATER: [] };
      for (const item of items) lanes[item.lane].push(item);
      return { lanes, count: items.length };
    },
  },

  {
    name: "delete_roadmap_item",
    description: "Delete a roadmap item. The linked feature (if any) stays in the library.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      await db.roadmapItem.delete({ where: { id } });
      return { ok: true, id };
    },
  },
];
