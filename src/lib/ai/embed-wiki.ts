import { db } from "@/lib/db";

import { embedText, toVectorLiteral } from "./embed";

export async function embedNote(noteId: string, title: string, body: string): Promise<void> {
  const vec = await embedText(`${title}\n\n${body}`);
  const literal = toVectorLiteral(vec);
  // Unsupported columns must be written via raw SQL — Prisma can't bind to
  // them via the generated client.
  // Column is camelCase (the Prisma field has no @map) — must be quoted in raw SQL.
  await db.$executeRaw`
    UPDATE wiki_note
       SET embedding    = ${literal}::vector,
           "embeddedAt" = NOW()
     WHERE id = ${noteId}
  `;
}
