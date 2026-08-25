import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

/**
 * Find-or-create a Cluster by name. Clusters are the "living wiki" hubs that
 * group features; both the meeting enrichment pass and the thread rollup name
 * clusters in free text, so they converge on the same row via the slug.
 */
export async function ensureCluster(name: string): Promise<string> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const existing = await db.cluster.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.cluster.create({
    data: { name: trimmed, slug, autoSuggested: true },
    select: { id: true },
  });
  return created.id;
}
