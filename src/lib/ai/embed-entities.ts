import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { embedText, toVectorLiteral } from "./embed";

// pgvector writes go through raw SQL — Prisma can't bind Unsupported columns.
// Mirrors the wiki embedding pattern (src/lib/ai/embed-wiki.ts).

export async function embedMeeting(
  id: string,
  title: string,
  tldr: string,
  transcript: string,
): Promise<void> {
  const text = `${title}\n\n${tldr}\n\n${transcript}`;
  const literal = toVectorLiteral(await embedText(text));
  await db.$executeRaw`
    UPDATE meeting
       SET embedding = ${literal}::vector, embedded_at = NOW()
     WHERE id = ${id}
  `;
}

export async function embedFeature(
  id: string,
  title: string,
  description: string,
): Promise<void> {
  const literal = toVectorLiteral(await embedText(`${title}\n\n${description}`));
  await db.$executeRaw`
    UPDATE feature
       SET embedding = ${literal}::vector, embedded_at = NOW()
     WHERE id = ${id}
  `;
}

export interface SimilarFeature {
  id: string;
  slug: string;
  title: string;
  similarity: number;
}

// Nearest existing feature to `text` — used to dedupe meeting signals so the
// library doesn't sprout duplicate entries for the same request.
export async function findSimilarFeature(text: string): Promise<SimilarFeature | null> {
  const literal = toVectorLiteral(await embedText(text));
  const rows = await db.$queryRaw<SimilarFeature[]>(Prisma.sql`
    SELECT id, slug, title, 1 - (embedding <=> ${literal}::vector) AS similarity
      FROM feature
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> ${literal}::vector
     LIMIT 1
  `);
  return rows[0] ?? null;
}

export interface MeetingHit {
  id: string;
  title: string;
  tldr: string | null;
  similarity: number;
}

export async function semanticSearchMeetings(query: string, limit = 4): Promise<MeetingHit[]> {
  const literal = toVectorLiteral(await embedText(query));
  return db.$queryRaw<MeetingHit[]>(Prisma.sql`
    SELECT id, title, tldr, 1 - (embedding <=> ${literal}::vector) AS similarity
      FROM meeting
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> ${literal}::vector
     LIMIT ${limit}
  `);
}

export interface FeatureHit {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  similarity: number;
}

export async function semanticSearchFeatures(query: string, limit = 6): Promise<FeatureHit[]> {
  const literal = toVectorLiteral(await embedText(query));
  return db.$queryRaw<FeatureHit[]>(Prisma.sql`
    SELECT id, slug, title, description, status::text AS status,
           1 - (embedding <=> ${literal}::vector) AS similarity
      FROM feature
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> ${literal}::vector
     LIMIT ${limit}
  `);
}
