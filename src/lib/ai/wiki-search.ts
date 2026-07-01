import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { embedText, toVectorLiteral } from "./embed";

export interface SemanticSearchResult {
  id: string;
  slug: string;
  title: string;
  body: string;
  tags: string[];
  similarity: number;
}

export async function semanticSearchWiki(
  query: string,
  opts: { limit?: number; tags?: string[] } = {},
): Promise<SemanticSearchResult[]> {
  const limit = opts.limit ?? 10;
  const vec = await embedText(query);
  const literal = toVectorLiteral(vec);

  const tagClause =
    opts.tags && opts.tags.length > 0
      ? Prisma.sql`AND tags && ${opts.tags}::text[]`
      : Prisma.empty;

  const rows = await db.$queryRaw<SemanticSearchResult[]>(Prisma.sql`
    SELECT id,
           slug,
           title,
           body,
           tags,
           1 - (embedding <=> ${literal}::vector) AS similarity
      FROM wiki_note
     WHERE embedding IS NOT NULL
       ${tagClause}
     ORDER BY embedding <=> ${literal}::vector
     LIMIT ${limit}
  `);

  return rows;
}
