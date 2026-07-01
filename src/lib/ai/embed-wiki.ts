import { db } from "@/lib/db";

import { embedText, toVectorLiteral } from "./embed";

export async function embedNote(noteId: string, title: string, body: string): Promise<void> {
  const vec = await embedText(`${title}\n\n${body}`);
  const literal = toVectorLiteral(vec);
  // Unsupported columns must be written via raw SQL — Prisma can't bind to
  // them via the generated client.
  await db.$executeRaw`
    UPDATE wiki_note
       SET embedding   = ${literal}::vector,
           embedded_at = NOW()
     WHERE id = ${noteId}
  `;
}
