import { z } from "zod";

import { db } from "@/lib/db";
import {
  createFolder,
  documentSelect,
  folderSelect,
  listDocuments,
  locatorSelect,
  resolveDocument,
  resolveFolderId,
} from "@/lib/documents/documents";
import { DOCUMENT_KINDS, resolveMimeType } from "@/lib/documents/file-types";
import { deleteStored, maxUploadBytes, storeUpload } from "@/lib/documents/storage";

import type { ToolDef } from "./types";

// Document store tools. Full CRUD, same as every other domain here.
//
// Reading bytes back is deliberately NOT a tool: a 30MB PDF base64'd into a
// tool result is useless to a model and would blow the context. `get_document`
// returns metadata plus the auth-gated URL to fetch it from instead.

const kindEnum = DOCUMENT_KINDS.map((k) => k.value) as [string, ...string[]];

const listSchema = z.object({
  folder: z.string().optional(),
  kind: z.enum(kindEnum).optional(),
  query: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const refSchema = z.object({ ref: z.string().min(1) });

const updateSchema = z.object({
  ref: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().nullable().optional(),
  folder: z.string().nullable().optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const createSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  content: z.string().min(1),
  mimeType: z.string().optional(),
  title: z.string().trim().max(300).optional(),
  description: z.string().optional(),
  folder: z.string().optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const folderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const DOCUMENT_TOOLS: ToolDef[] = [
  {
    name: "list_documents",
    description:
      "List stored documents — PDFs, images, spreadsheets, decks, anything that was " +
      "uploaded to the Documents store. Newest first. Filter by folder, file kind, tag, " +
      "or a substring of the name/description. Returns metadata and a download URL, " +
      "never the file bytes.",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Folder slug, name or id." },
        kind: { type: "string", enum: kindEnum, description: "Coarse file family." },
        query: { type: "string", description: "Substring of title, file name, description or tag." },
        tag: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50" },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const documents = await listDocuments(
        { folderSlug: input.folder, kind: input.kind as never, query: input.query, tag: input.tag },
        input.limit ?? 50,
      );
      return { documents: documents.map(withUrl), count: documents.length };
    },
  },

  {
    name: "get_document",
    description:
      "Fetch one document's metadata by id, exact file name or title. The `url` in the " +
      "response serves the actual bytes, but it is behind the session cookie — give it " +
      "to the user to open, don't try to fetch it with the API token.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string", description: "Document id, file name or title." } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = refSchema.parse(args);
      const found = await resolveDocument(ref);
      const doc = await db.document.findUnique({ where: { id: found.id }, select: documentSelect });
      if (!doc) throw new Error(`Document not found: ${ref}`);
      return withUrl(doc);
    },
  },

  {
    name: "create_document",
    description:
      "Store a small file in the Documents store from base64 content. Intended for things " +
      "you generate — an extracted report, a converted CSV, a summary PDF — not for " +
      "shovelling large binaries through the tool channel: base64 inflates by a third and " +
      "the whole payload sits in the request. Anything big should be dropped on /documents " +
      "in the browser instead.",
    inputSchema: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Including extension, e.g. 'q3-summary.pdf'." },
        content: { type: "string", description: "Base64-encoded file contents (no data: prefix)." },
        mimeType: { type: "string", description: "Inferred from the extension when omitted." },
        title: { type: "string", description: "Display name. Defaults to the file name." },
        description: { type: "string" },
        folder: { type: "string", description: "Folder slug, name or id." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["fileName", "content"],
    },
    handler: async (args, ctx) => {
      const input = createSchema.parse(args);
      const fileName = input.fileName.split(/[\\/]/).pop()!.slice(0, 255);

      const bytes = Buffer.from(input.content, "base64");
      if (bytes.byteLength === 0) throw new Error("Content decoded to zero bytes.");
      const limit = maxUploadBytes();
      if (bytes.byteLength > limit) {
        throw new Error(
          `That file is ${Math.round(bytes.byteLength / 1024 / 1024)}MB, over the ` +
            `${Math.round(limit / 1024 / 1024)}MB limit. Upload it at /documents instead.`,
        );
      }

      const folderId = await resolveFolderId(input.folder);
      // Reuse the upload path so the checksum, the size and the choice of
      // backend are computed exactly the same way as a browser upload.
      const stored = await storeUpload(
        new Response(new Uint8Array(bytes)).body,
        fileName,
      );

      try {
        const document = await db.document.create({
          data: {
            id: stored.id,
            title: (input.title || fileName.replace(/\.[^.]+$/, "") || fileName).slice(0, 300),
            description: input.description?.trim() || null,
            fileName,
            mimeType: resolveMimeType(fileName, input.mimeType),
            byteSize: stored.byteSize,
            checksum: stored.checksum,
            tags: [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))],
            folderId,
            storage: stored.storage,
            storageKey: stored.storageKey,
            data: stored.data,
            uploadedById: ctx.userId,
          },
          select: documentSelect,
        });
        return withUrl(document);
      } catch (err) {
        await deleteStored(stored).catch(() => {});
        throw err;
      }
    },
  },

  {
    name: "update_document",
    description:
      "Update a document's metadata — title, description, folder, tags. Pass null for " +
      "description or folder to clear it. The stored bytes and the original file name " +
      "are immutable; re-upload to replace a file.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Document id, file name or title." },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        folder: { type: ["string", "null"], description: "Folder slug, name or id." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["ref"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const { id } = await resolveDocument(input.ref);

      const document = await db.document.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.folder !== undefined
            ? { folderId: input.folder ? await resolveFolderId(input.folder) : null }
            : {}),
          ...(input.tags !== undefined
            ? { tags: [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] }
            : {}),
        },
        select: documentSelect,
      });
      return withUrl(document);
    },
  },

  {
    name: "delete_document",
    description:
      "Permanently delete a document and its stored bytes. There is no undo and no bin — " +
      "confirm with the user first unless they explicitly asked for this file to go.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string", description: "Document id, file name or title." } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = refSchema.parse(args);
      const doc = await resolveDocument(ref);
      const full = await db.document.findUnique({ where: { id: doc.id }, select: locatorSelect });
      await db.document.delete({ where: { id: doc.id } });
      if (full) await deleteStored(full).catch(() => {});
      return { ok: true, id: doc.id, fileName: doc.fileName };
    },
  },

  {
    name: "list_document_folders",
    description: "List the document folders, with how many files each one holds.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const folders = await db.documentFolder.findMany({
        orderBy: { sortOrder: "asc" },
        select: folderSelect,
      });
      return { folders, count: folders.length };
    },
  },

  {
    name: "create_document_folder",
    description:
      "Create a document folder. Don't create folders unprompted — ask first; a store " +
      "with fifteen near-identical folders is worse than a flat one.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string", description: "Hex, e.g. '#0A84FF'." },
      },
      required: ["name"],
    },
    handler: async (args) => createFolder(folderSchema.parse(args)),
  },
];

/** Documents are served from an auth-gated route, so hand back the path rather
 *  than pretending the bytes are in the tool result. */
function withUrl<T extends { id: string }>(doc: T): T & { url: string } {
  return { ...doc, url: `/api/documents/${doc.id}` };
}
