import type { FeatureStatus } from "@prisma/client";

import { embedFeature, findSimilarFeature } from "@/lib/ai/embed-entities";
import { ensureCluster } from "@/lib/clusters";
import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

// Cosine similarity above which two ideas are treated as the same feature.
// Shared by the meeting-signal pass and the thread rollup so the library grows
// by one row per real idea, however that idea arrived.
export const DEDUPE_THRESHOLD = 0.82;

export interface IdeaInput {
  title: string;
  detail?: string | null;
  tags?: string[];
  cluster?: string | null;
  status?: FeatureStatus;
}

export interface UpsertFeatureResult {
  featureId: string;
  created: boolean;
  clusterId: string | null;
}

/**
 * Land an idea in the Feature Library exactly once: embed it, look for a
 * near-duplicate, and either return the existing feature or create a new one.
 * Callers decide what to do with `created` (a meeting signal marks itself
 * ALREADY_TRACKED on a match; a thread rollup just links).
 */
export async function upsertFeatureFromIdea(idea: IdeaInput): Promise<UpsertFeatureResult> {
  const clusterId = idea.cluster ? await ensureCluster(idea.cluster) : null;
  const match = await findSimilarFeature(`${idea.title}\n${idea.detail ?? ""}`);

  if (match && match.similarity >= DEDUPE_THRESHOLD) {
    if (clusterId) {
      // Adopt the cluster only when the existing feature had none — never
      // reassign a feature someone already filed deliberately.
      await db.feature.updateMany({
        where: { id: match.id, clusterId: null },
        data: { clusterId },
      });
    }
    return { featureId: match.id, created: false, clusterId };
  }

  const slug = await uniqueSlug(slugify(idea.title), async (c) =>
    Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
  );
  const feature = await db.feature.create({
    data: {
      title: idea.title,
      slug,
      description: idea.detail ?? null,
      tags: idea.tags ?? [],
      status: idea.status ?? "IDEA",
      clusterId,
    },
    select: { id: true },
  });
  try {
    await embedFeature(feature.id, idea.title, idea.detail ?? "");
  } catch (err) {
    // The embed sweep will pick it up within 10 minutes.
    console.warn("[features] embedFeature failed:", err);
  }
  return { featureId: feature.id, created: true, clusterId };
}
