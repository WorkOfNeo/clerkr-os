import { z } from "zod";

import { db } from "@/lib/db";
import { embedNote } from "@/lib/ai/embed-wiki";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { semanticSearchWiki } from "@/lib/ai/wiki-search";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

const noteSelect = {
  id: true,
  slug: true,
  title: true,
  body: true,
  tags: true,
  embeddedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, email: true, name: true } },
} as const;

async function tryEmbed(id: string, title: string, body: string): Promise<{ embedded: boolean; error?: string }> {
  if (!isOpenAIAvailable()) {
    return { embedded: false, error: "OPENAI_API_KEY not set" };
  }
  try {
    await embedNote(id, title, body);
    return { embedded: true };
  } catch (err) {
    return { embedded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const WIKI_TOOLS: ToolDef[] = [
  {
    name: "create_wiki_note",
    description:
      "Create a wiki note (living knowledge). Embeds inline so it's immediately searchable. " +
      "If OpenAI is unavailable the note still saves; embedding is skipped and can be retried via update_wiki_note.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "Markdown." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "body"],
    },
    handler: async (args, ctx) => {
      const input = createSchema.parse(args);
      const slug = await uniqueSlug(slugify(input.title), async (s) =>
        Boolean(await db.wikiNote.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const note = await db.wikiNote.create({
        data: {
          slug,
          title: input.title,
          body: input.body,
          tags: input.tags ?? [],
          authorId: ctx.userId,
        },
        select: noteSelect,
      });
      const embed = await tryEmbed(note.id, note.title, note.body);
      return { ...note, embedded: embed.embedded, embedError: embed.error };
    },
  },

  {
    name: "update_wiki_note",
    description:
      "Update a wiki note. Re-embeds only if title or body changed. Pass tags to replace the full tag list.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const existing = await db.wikiNote.findUnique({
        where: { id: input.id },
        select: { title: true, body: true },
      });
      if (!existing) throw new Error(`Wiki note not found: ${input.id}`);

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.body !== undefined) data.body = input.body;
      if (input.tags !== undefined) data.tags = input.tags;

      const note = await db.wikiNote.update({
        where: { id: input.id },
        data,
        select: noteSelect,
      });

      const titleChanged = input.title !== undefined && input.title !== existing.title;
      const bodyChanged = input.body !== undefined && input.body !== existing.body;
      let embedResult: { embedded: boolean; error?: string } = { embedded: false };
      if (titleChanged || bodyChanged) {
        embedResult = await tryEmbed(note.id, note.title, note.body);
      }
      return { ...note, reembedded: titleChanged || bodyChanged, ...embedResult };
    },
  },

  {
    name: "delete_wiki_note",
    description: "Hard-delete a wiki note.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(args);
      await db.wikiNote.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "get_wiki_note",
    description: "Fetch one wiki note by id or slug.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" } },
    },
    handler: async (args) => {
      const { id, slug } = z
        .object({ id: z.string().optional(), slug: z.string().optional() })
        .parse(args);
      if (!id && !slug) throw new Error("Provide `id` or `slug`.");
      const note = await db.wikiNote.findFirst({
        where: id ? { id } : { slug: slug! },
        select: noteSelect,
      });
      if (!note) throw new Error(`Wiki note not found: ${id ?? slug}`);
      return note;
    },
  },

  {
    name: "list_wiki_notes",
    description: "List wiki notes (most recently updated first). Filter by tag or author email.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Single tag filter; matches if the note has this tag." },
        authorEmail: { type: "string", format: "email" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    handler: async (args) => {
      const { tag, authorEmail, limit } = z
        .object({
          tag: z.string().optional(),
          authorEmail: z.string().email().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);
      const where: Record<string, unknown> = {};
      if (tag) where.tags = { has: tag };
      if (authorEmail) where.author = { email: authorEmail.toLowerCase() };
      const notes = await db.wikiNote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit ?? 50,
        select: noteSelect,
      });
      return { notes, count: notes.length };
    },
  },

  {
    name: "search_wiki_notes",
    description:
      "Semantic search against wiki notes using OpenAI embeddings + pgvector cosine distance. " +
      "Returns top-K with similarity scores (0–1, higher = more relevant). " +
      "Requires OPENAI_API_KEY; falls back to a substring search on title/body if unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        tags: { type: "array", items: { type: "string" }, description: "Restrict to notes with any of these tags." },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit, tags } = z
        .object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
          tags: z.array(z.string()).optional(),
        })
        .parse(args);

      if (!isOpenAIAvailable()) {
        // Substring fallback.
        const q = { contains: query, mode: "insensitive" as const };
        const notes = await db.wikiNote.findMany({
          where: { OR: [{ title: q }, { body: q }] },
          orderBy: { updatedAt: "desc" },
          take: limit ?? 10,
          select: noteSelect,
        });
        return { mode: "substring-fallback", notes, count: notes.length };
      }

      const results = await semanticSearchWiki(query, { limit: limit ?? 10, tags });
      return { mode: "semantic", results, count: results.length };
    },
  },
];
