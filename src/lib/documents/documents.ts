import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

import { documentKind, type DocumentKind } from "./file-types";

// Shared query shapes and lookups for the document store. The write path for
// bytes is the upload route (src/app/api/documents/upload); everything that
// only touches metadata goes through server actions or MCP tools and uses the
// selects here.

/**
 * NEVER select `data` in a list query. Same rule as `attachmentSelect` in
 * tickets.ts, and it bites harder here: these are original files, so a page of
 * twenty rows would be hundreds of megabytes. The id is enough to build the URL.
 */
export const documentSelect = {
  id: true,
  title: true,
  description: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  checksum: true,
  tags: true,
  storage: true,
  createdAt: true,
  updatedAt: true,
  folder: { select: { id: true, slug: true, name: true, color: true } },
  uploadedBy: { select: { id: true, email: true, name: true } },
} satisfies Prisma.DocumentSelect;

export type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

/** Just enough to find and delete the bytes. */
export const locatorSelect = {
  id: true,
  storage: true,
  storageKey: true,
  byteSize: true,
  fileName: true,
  mimeType: true,
} satisfies Prisma.DocumentSelect;

export const folderSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  color: true,
  sortOrder: true,
  _count: { select: { documents: true } },
} satisfies Prisma.DocumentFolderSelect;

/** Resolve a folder by id, slug or name — MCP callers pass whichever they have.
 *  Unlike ticket categories this returns null for an unknown name rather than
 *  throwing, so `folder: null` means "no folder" and a typo is still an error. */
export async function resolveFolderId(ref?: string | null): Promise<string | null> {
  if (!ref?.trim()) return null;
  const needle = ref.trim();
  const folder = await db.documentFolder.findFirst({
    where: {
      OR: [
        { id: needle },
        { slug: slugify(needle) },
        { name: { equals: needle, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!folder) throw new Error(`No such document folder: ${ref}`);
  return folder.id;
}

export async function createFolder(input: {
  name: string;
  description?: string | null;
  color?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("A folder needs a name.");
  const slug = await uniqueSlug(slugify(name), async (c) =>
    Boolean(await db.documentFolder.findUnique({ where: { slug: c }, select: { id: true } })),
  );
  const last = await db.documentFolder.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return db.documentFolder.create({
    data: {
      slug,
      name,
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
    select: folderSelect,
  });
}

/** Resolve a document by id or exact file name. */
export async function resolveDocument(ref: string) {
  const doc = await db.document.findFirst({
    where: { OR: [{ id: ref }, { fileName: ref }, { title: ref }] },
    select: locatorSelect,
  });
  if (!doc) throw new Error(`Document not found: ${ref}`);
  return doc;
}

export interface DocumentFilters {
  folderSlug?: string | null;
  kind?: DocumentKind | null;
  query?: string | null;
  tag?: string | null;
}

/**
 * Filename/title/description/tag search. Substring rather than semantic on
 * purpose: what you remember about a file is its name, and `data` is bytes we
 * can't read without a per-format text extractor.
 *
 * `kind` can't be a WHERE clause — it's derived from mime type AND extension
 * (a .csv is text/plain often enough) — so it filters in memory after the take.
 */
export async function listDocuments(filters: DocumentFilters = {}, limit = 200) {
  const q = filters.query?.trim();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const rows = await db.document.findMany({
    where: {
      ...(filters.folderSlug ? { folder: { slug: filters.folderSlug } } : {}),
      ...(filters.tag ? { tags: { has: filters.tag } } : {}),
      ...(contains
        ? {
            OR: [
              { title: contains },
              { fileName: contains },
              { description: contains },
              { tags: { has: q! } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: documentSelect,
  });

  return filters.kind
    ? rows.filter((d) => documentKind(d.mimeType, d.fileName) === filters.kind)
    : rows;
}
