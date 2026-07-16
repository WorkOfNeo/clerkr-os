import { z } from "zod";

import { embedFeature, semanticSearchFeatures } from "@/lib/ai/embed-entities";
import { sweepMissingEmbeddings } from "@/lib/ai/embed-sweep";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

const FEATURE_STATUSES = ["IDEA", "VALIDATED", "IN_ROADMAP", "SHIPPED", "SMALL_UNIQUE"] as const;
const LINK_KINDS = ["RELATED", "DEPENDS_ON"] as const;

const SIGNAL_TO_FEATURE_STATUS = {
  NEW: "IDEA",
  ALREADY_TRACKED: "VALIDATED",
  SMALL_UNIQUE: "SMALL_UNIQUE",
} as const;

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(FEATURE_STATUSES).optional(),
  tags: z.array(z.string()).optional(),
  cluster: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(FEATURE_STATUSES).optional(),
  tags: z.array(z.string()).optional(),
  cluster: z.string().nullable().optional(),
});

const listSchema = z.object({
  status: z.enum(FEATURE_STATUSES).optional(),
  cluster: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

const featureSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  status: true,
  tags: true,
  embeddedAt: true,
  createdAt: true,
  updatedAt: true,
  cluster: { select: { id: true, slug: true, name: true } },
} as const;

const featureFullSelect = {
  ...featureSelect,
  signals: {
    select: {
      id: true,
      title: true,
      status: true,
      meeting: { select: { id: true, slug: true, title: true, meetingDate: true } },
    },
  },
  roadmapItems: { select: { id: true, slug: true, title: true, lane: true } },
  linksFrom: {
    select: { id: true, kind: true, to: { select: { id: true, slug: true, title: true } } },
  },
  linksTo: {
    select: { id: true, kind: true, from: { select: { id: true, slug: true, title: true } } },
  },
} as const;

// Find-or-create a cluster by name (mirrors the enrichment pass in
// src/lib/ai/enrich-meeting.ts).
async function ensureCluster(name: string): Promise<string> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const existing = await db.cluster.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.cluster.create({
    data: { name: trimmed, slug },
    select: { id: true },
  });
  return created.id;
}

async function tryEmbedFeature(
  id: string,
  title: string,
  description: string,
): Promise<{ embedded: boolean; error?: string }> {
  if (!isOpenAIAvailable()) return { embedded: false, error: "OPENAI_API_KEY not set" };
  try {
    await embedFeature(id, title, description);
    return { embedded: true };
  } catch (err) {
    return { embedded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const FEATURE_TOOLS: ToolDef[] = [
  {
    name: "create_feature",
    description:
      "Add a feature to the Feature Library (the self-growing catalog of what Clerkr has, is " +
      "building, or has heard requested). Embeds inline so it's immediately available for " +
      "semantic dedupe. Before creating, prefer search_features to check whether it already " +
      "exists. Pass cluster as a name — it's found-or-created.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        status: {
          type: "string",
          enum: ["IDEA", "VALIDATED", "IN_ROADMAP", "SHIPPED", "SMALL_UNIQUE"],
          description: "Default IDEA. SHIPPED = already built; VALIDATED = confirmed demand.",
        },
        tags: { type: "array", items: { type: "string" } },
        cluster: { type: "string", description: "Cluster (product area) name, e.g. 'Outlook integration'." },
      },
      required: ["title"],
    },
    handler: async (args) => {
      const input = createSchema.parse(args);
      const slug = await uniqueSlug(slugify(input.title), async (c) =>
        Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const clusterId = input.cluster ? await ensureCluster(input.cluster) : null;
      const feature = await db.feature.create({
        data: {
          title: input.title.trim(),
          slug,
          description: input.description ?? null,
          status: input.status ?? "IDEA",
          tags: input.tags ?? [],
          clusterId,
        },
        select: featureSelect,
      });
      const embed = await tryEmbedFeature(feature.id, feature.title, feature.description ?? "");
      return { ...feature, embedded: embed.embedded, embedError: embed.error };
    },
  },

  {
    name: "update_feature",
    description:
      "Update a feature. Re-embeds if title or description changed. Pass cluster as a name " +
      "(found-or-created) or null to detach; pass tags to replace the full tag list.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        status: {
          type: "string",
          enum: ["IDEA", "VALIDATED", "IN_ROADMAP", "SHIPPED", "SMALL_UNIQUE"],
        },
        tags: { type: "array", items: { type: "string" } },
        cluster: { type: ["string", "null"] },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const existing = await db.feature.findUnique({
        where: { id: input.id },
        select: { title: true, description: true },
      });
      if (!existing) throw new Error(`Feature not found: ${input.id}`);

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.description !== undefined) data.description = input.description;
      if (input.status !== undefined) data.status = input.status;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.cluster !== undefined) {
        data.clusterId = input.cluster === null ? null : await ensureCluster(input.cluster);
      }

      const feature = await db.feature.update({
        where: { id: input.id },
        data,
        select: featureSelect,
      });

      const changed =
        (input.title !== undefined && input.title !== existing.title) ||
        (input.description !== undefined && input.description !== existing.description);
      let embed: { embedded: boolean; error?: string } = { embedded: false };
      if (changed) {
        embed = await tryEmbedFeature(feature.id, feature.title, feature.description ?? "");
      }
      return { ...feature, embedded: embed.embedded, embedError: embed.error };
    },
  },

  {
    name: "delete_feature",
    description:
      "Delete a feature from the library. Meeting signals that pointed at it are kept but " +
      "unlinked; roadmap items lose their feature reference.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      // Nullable FKs don't cascade — detach dependents first.
      await db.$transaction([
        db.featureSignal.updateMany({ where: { featureId: id }, data: { featureId: null } }),
        db.roadmapItem.updateMany({ where: { featureId: id }, data: { featureId: null } }),
        db.feature.delete({ where: { id } }),
      ]);
      return { ok: true, id };
    },
  },

  {
    name: "get_feature",
    description:
      "Fetch one feature by id or slug, including its meeting signals (provenance — which " +
      "meetings asked for it), roadmap items, and knowledge-graph links.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Feature id (uuid) or slug." } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const feature = await db.feature.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        select: featureFullSelect,
      });
      if (!feature) throw new Error(`Feature not found: ${id}`);
      return feature;
    },
  },

  {
    name: "list_features",
    description:
      "List features in the library with optional status / cluster (slug or name) / tag filters. " +
      "Newest first.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["IDEA", "VALIDATED", "IN_ROADMAP", "SHIPPED", "SMALL_UNIQUE"],
        },
        cluster: { type: "string", description: "Cluster slug or name." },
        tag: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50" },
        offset: { type: "integer", minimum: 0 },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const where: Record<string, unknown> = {};
      if (input.status) where.status = input.status;
      if (input.tag) where.tags = { has: input.tag };
      if (input.cluster) {
        where.cluster = {
          is: {
            OR: [
              { slug: input.cluster },
              { name: { equals: input.cluster, mode: "insensitive" } },
            ],
          },
        };
      }
      const features = await db.feature.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit ?? 50,
        skip: input.offset ?? 0,
        select: featureSelect,
      });
      return { features, count: features.length };
    },
  },

  {
    name: "search_features",
    description:
      "Semantic search across the Feature Library — use this to answer 'is there already " +
      "something like X?' before creating features or when categorizing meeting notes. " +
      "Returns similarity scores (≥0.82 is treated as the same feature by the auto-dedupe). " +
      "Falls back to case-insensitive text match when OpenAI is unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = z
        .object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).optional() })
        .parse(args);
      if (isOpenAIAvailable()) {
        const hits = await semanticSearchFeatures(query, limit ?? 6);
        return { hits, mode: "semantic" };
      }
      const q = { contains: query, mode: "insensitive" as const };
      const features = await db.feature.findMany({
        where: { OR: [{ title: q }, { description: q }] },
        orderBy: { createdAt: "desc" },
        take: limit ?? 6,
        select: featureSelect,
      });
      return { hits: features, mode: "text" };
    },
  },

  {
    name: "promote_signal_to_feature",
    description:
      "Promote a meeting feature signal into a Feature Library entry (NEW→IDEA, " +
      "ALREADY_TRACKED→VALIDATED, SMALL_UNIQUE→SMALL_UNIQUE) and link the signal to it. " +
      "Optional cluster name is found-or-created.",
    inputSchema: {
      type: "object",
      properties: {
        signalId: { type: "string" },
        cluster: { type: "string" },
      },
      required: ["signalId"],
    },
    handler: async (args) => {
      const input = z
        .object({ signalId: z.string().min(1), cluster: z.string().optional() })
        .parse(args);
      const signal = await db.featureSignal.findUnique({ where: { id: input.signalId } });
      if (!signal) throw new Error(`Signal not found: ${input.signalId}`);
      if (signal.featureId) {
        const existing = await db.feature.findUnique({
          where: { id: signal.featureId },
          select: featureSelect,
        });
        if (existing) return { ...existing, alreadyLinked: true };
      }

      const slug = await uniqueSlug(slugify(signal.title), async (c) =>
        Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const clusterId = input.cluster ? await ensureCluster(input.cluster) : null;
      const feature = await db.feature.create({
        data: {
          title: signal.title,
          slug,
          description: signal.detail,
          tags: signal.tags,
          status: SIGNAL_TO_FEATURE_STATUS[signal.status],
          clusterId,
        },
        select: featureSelect,
      });
      await db.featureSignal.update({
        where: { id: signal.id },
        data: { featureId: feature.id },
      });
      const embed = await tryEmbedFeature(feature.id, feature.title, feature.description ?? "");
      return { ...feature, alreadyLinked: false, embedded: embed.embedded };
    },
  },

  {
    name: "link_features",
    description:
      "Create (or re-kind) a knowledge-graph edge between two features: RELATED or DEPENDS_ON " +
      "(from depends on to). Upserts — safe to call twice.",
    inputSchema: {
      type: "object",
      properties: {
        fromId: { type: "string" },
        toId: { type: "string" },
        kind: { type: "string", enum: ["RELATED", "DEPENDS_ON"], description: "Default RELATED." },
      },
      required: ["fromId", "toId"],
    },
    handler: async (args) => {
      const input = z
        .object({
          fromId: z.string().min(1),
          toId: z.string().min(1),
          kind: z.enum(LINK_KINDS).optional(),
        })
        .parse(args);
      if (input.fromId === input.toId) throw new Error("A feature can't link to itself");
      const link = await db.featureLink.upsert({
        where: { fromId_toId: { fromId: input.fromId, toId: input.toId } },
        create: { fromId: input.fromId, toId: input.toId, kind: input.kind ?? "RELATED" },
        update: { kind: input.kind ?? "RELATED" },
        select: {
          id: true,
          kind: true,
          from: { select: { id: true, slug: true, title: true } },
          to: { select: { id: true, slug: true, title: true } },
        },
      });
      return link;
    },
  },

  {
    name: "unlink_features",
    description: "Remove a knowledge-graph edge by its link id (see get_feature linksFrom/linksTo).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      await db.featureLink.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "list_clusters",
    description:
      "List clusters (product-area hubs in the knowledge graph) with their feature counts.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const clusters = await db.cluster.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          icon: true,
          color: true,
          autoSuggested: true,
          _count: { select: { features: true } },
        },
      });
      return {
        clusters: clusters.map(({ _count, ...c }) => ({ ...c, featureCount: _count.features })),
        count: clusters.length,
      };
    },
  },

  {
    name: "upsert_cluster",
    description:
      "Create a cluster (product area) or update an existing one matched by name/slug.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: ["string", "null"] },
        icon: { type: ["string", "null"], description: "Emoji shown on the hub node." },
        color: { type: ["string", "null"] },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const input = z
        .object({
          name: z.string().min(1),
          description: z.string().nullable().optional(),
          icon: z.string().nullable().optional(),
          color: z.string().nullable().optional(),
        })
        .parse(args);
      const slug = slugify(input.name.trim());
      const data: Record<string, unknown> = { name: input.name.trim() };
      if (input.description !== undefined) data.description = input.description;
      if (input.icon !== undefined) data.icon = input.icon;
      if (input.color !== undefined) data.color = input.color;
      const cluster = await db.cluster.upsert({
        where: { slug },
        create: { slug, ...data } as { slug: string; name: string },
        update: data,
        select: { id: true, slug: true, name: true, description: true, icon: true, color: true },
      });
      return cluster;
    },
  },

  {
    name: "backfill_embeddings",
    description:
      "Embed wiki notes, features, and meetings that are missing embeddings (rows created " +
      "while OpenAI was unavailable, bulk backfills, or transient embed failures). Without " +
      "an embedding a row is invisible to semantic search and the auto-dedupe. The server " +
      "also runs this sweep automatically every 10 minutes; call it when you want the " +
      "backlog cleared now. Processes up to `limit` rows per kind; re-run until remaining " +
      "is all zeros.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Per kind. Default 50." },
      },
    },
    handler: async (args) => {
      const { limit } = z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .parse(args);
      if (!isOpenAIAvailable()) throw new Error("OPENAI_API_KEY is not set.");
      return sweepMissingEmbeddings(limit ?? 50);
    },
  },
];
