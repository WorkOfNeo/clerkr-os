"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { embedNote } from "@/lib/ai/embed-wiki";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { semanticSearchWiki, type SemanticSearchResult } from "@/lib/ai/wiki-search";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";

const createInputSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export async function createWikiNote(input: {
  title: string;
  body: string;
  tags?: string[];
}): Promise<{ slug: string; embedded: boolean; error?: string }> {
  const session = await requireSession();
  const parsed = createInputSchema.parse(input);
  const slug = await uniqueSlug(slugify(parsed.title), async (s) =>
    Boolean(await db.wikiNote.findUnique({ where: { slug: s }, select: { id: true } })),
  );

  const note = await db.wikiNote.create({
    data: {
      slug,
      title: parsed.title,
      body: parsed.body,
      tags: parsed.tags ?? [],
      authorId: session.user.id,
    },
  });

  let embedded = false;
  let error: string | undefined;
  if (isOpenAIAvailable()) {
    try {
      await embedNote(note.id, note.title, note.body);
      embedded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } else {
    error = "OPENAI_API_KEY not set";
  }

  revalidatePath("/wiki");
  return { slug: note.slug, embedded, error };
}

export async function createWikiNoteFromForm(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const tagsStr = String(formData.get("tags") ?? "");
  const tags = tagsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const { slug } = await createWikiNote({ title, body, tags });
  redirect(`/wiki/${slug}`);
}

export async function updateWikiNote(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const existing = await db.wikiNote.findUnique({ where: { id }, select: { title: true, body: true, slug: true } });
  if (!existing) throw new Error(`Wiki note not found: ${id}`);

  const note = await db.wikiNote.update({
    where: { id },
    data: { title, body, tags },
  });

  const changed = title !== existing.title || body !== existing.body;
  if (changed && isOpenAIAvailable()) {
    try {
      await embedNote(note.id, note.title, note.body);
    } catch (err) {
      console.warn("[wiki] embed failed:", err);
    }
  }

  revalidatePath("/wiki");
  revalidatePath(`/wiki/${note.slug}`);
}

export async function deleteWikiNote(id: string): Promise<void> {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.wikiNote.delete({ where: { id } });
  revalidatePath("/wiki");
  redirect("/wiki");
}

export async function searchWikiNotes(query: string): Promise<{
  mode: "semantic" | "substring";
  results: (SemanticSearchResult | {
    id: string;
    slug: string;
    title: string;
    body: string;
    tags: string[];
    similarity: number;
  })[];
}> {
  await requireSession();
  if (!query.trim()) return { mode: "substring", results: [] };

  if (isOpenAIAvailable()) {
    try {
      const results = await semanticSearchWiki(query, { limit: 20 });
      return { mode: "semantic", results };
    } catch (err) {
      console.warn("[wiki] semantic search failed, falling back:", err);
    }
  }

  const q = { contains: query, mode: "insensitive" as const };
  const rows = await db.wikiNote.findMany({
    where: { OR: [{ title: q }, { body: q }] },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, slug: true, title: true, body: true, tags: true },
  });
  return {
    mode: "substring",
    results: rows.map((r) => ({ ...r, similarity: 0 })),
  };
}
