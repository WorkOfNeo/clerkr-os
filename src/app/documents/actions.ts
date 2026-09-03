"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { createFolder, folderSelect, locatorSelect } from "@/lib/documents/documents";
import { deleteStored } from "@/lib/documents/storage";
import { requireSession } from "@/lib/session";

// Metadata only. The bytes arrive through /api/documents/upload — a server
// action can't take a 40MB file without base64-inflating it through the RSC
// payload (see the note on that route).

const updateInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Give it a name").max(300).optional(),
  description: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
});

export async function updateDocument(input: z.infer<typeof updateInput>): Promise<void> {
  await requireSession();
  const { id, ...rest } = updateInput.parse(input);

  await db.document.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.description !== undefined ? { description: rest.description?.trim() || null } : {}),
      ...(rest.folderId !== undefined ? { folderId: rest.folderId || null } : {}),
      ...(rest.tags !== undefined
        ? { tags: [...new Set(rest.tags.map((t) => t.toLowerCase()))] }
        : {}),
    },
  });

  revalidatePath("/documents");
}

export async function deleteDocument(id: string): Promise<void> {
  await requireSession();
  const doc = await db.document.findUnique({ where: { id }, select: locatorSelect });
  if (!doc) return;

  // Row first: a dangling file on the volume is recoverable clutter, a row
  // pointing at bytes that are gone is a broken download.
  await db.document.delete({ where: { id } });
  try {
    await deleteStored(doc);
  } catch (err) {
    console.warn(`[documents] could not remove bytes for ${id}:`, err);
  }

  revalidatePath("/documents");
}

const folderInput = z.object({
  name: z.string().trim().min(1, "Give the folder a name").max(80),
  description: z.string().optional(),
  color: z.string().optional(),
});

export async function createDocumentFolder(
  input: z.infer<typeof folderInput>,
): Promise<{ id: string; slug: string; name: string }> {
  await requireSession();
  const parsed = folderInput.parse(input);
  const folder = await createFolder(parsed);
  revalidatePath("/documents");
  return { id: folder.id, slug: folder.slug, name: folder.name };
}

export async function renameDocumentFolder(id: string, name: string): Promise<void> {
  await requireSession();
  const clean = z.string().trim().min(1).max(80).parse(name);
  await db.documentFolder.update({ where: { id }, data: { name: clean } });
  revalidatePath("/documents");
}

/**
 * Deleting a folder never deletes the documents in it — `folderId` is nullable
 * with onDelete: SetNull, so they fall back to unfiled. Same rule as ticket
 * categories, and for the same reason: the container is disposable, the
 * contents are not.
 */
export async function deleteDocumentFolder(id: string): Promise<void> {
  await requireSession();
  await db.documentFolder.delete({ where: { id } });
  revalidatePath("/documents");
}

export async function listDocumentFolders() {
  await requireSession();
  return db.documentFolder.findMany({ orderBy: { sortOrder: "asc" }, select: folderSelect });
}
