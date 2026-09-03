import { z } from "zod";

import { db } from "@/lib/db";
import { documentSelect, resolveFolderId } from "@/lib/documents/documents";
import { resolveMimeType } from "@/lib/documents/file-types";
import {
  UploadTooLargeError,
  deleteStored,
  maxUploadBytes,
  storeUpload,
} from "@/lib/documents/storage";
import { getSession } from "@/lib/session";

/**
 * Document upload. A route handler rather than a server action, which is the
 * documented exception in CLAUDE.md rather than a departure from it: a server
 * action would carry the file base64-encoded inside the RSC payload — a third
 * bigger, buffered whole in memory, and capped by `serverActions.bodySizeLimit`.
 * Here the raw file IS the request body, so it streams to its final home and
 * memory stays flat whatever the size.
 *
 * One file per request: the client sends them in sequence, which is what makes
 * per-file progress and per-file failure possible.
 *
 *   PUT /api/documents/upload?name=Contract.pdf&type=application/pdf&folder=<slug>
 *
 * Auth is the session cookie, enforced here and again in src/proxy.ts — these
 * are original client documents, so this route is not in the public allowlist.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Big files over a slow line need more than the default budget.
export const maxDuration = 300;

const querySchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().max(255).optional(),
  folder: z.string().trim().optional(),
  title: z.string().trim().max(300).optional(),
});

export async function PUT(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    name: url.searchParams.get("name") ?? "",
    type: url.searchParams.get("type") ?? undefined,
    folder: url.searchParams.get("folder") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "A file name is required." }, { status: 400 });
  }

  const { name, type, folder, title } = parsed.data;
  // Strip any path the browser included — only the leaf is ever a file name.
  const fileName = name.split(/[\\/]/).pop()!.slice(0, 255);
  const mimeType = resolveMimeType(fileName, type);

  let folderId: string | null;
  try {
    folderId = await resolveFolderId(folder);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  let stored;
  try {
    stored = await storeUpload(req.body, fileName);
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return Response.json({ error: err.message }, { status: 413 });
    }
    console.error("[documents] upload failed:", err);
    return Response.json({ error: "Could not store that file." }, { status: 500 });
  }

  if (stored.byteSize === 0) {
    await deleteStored(stored).catch(() => {});
    return Response.json({ error: "That file is empty." }, { status: 400 });
  }

  try {
    const document = await db.document.create({
      data: {
        id: stored.id,
        title: (title || fileName.replace(/\.[^.]+$/, "") || fileName).slice(0, 300),
        fileName,
        mimeType,
        byteSize: stored.byteSize,
        checksum: stored.checksum,
        folderId,
        storage: stored.storage,
        storageKey: stored.storageKey,
        data: stored.data,
        uploadedById: session.user.id,
      },
      select: documentSelect,
    });
    return Response.json({ document }, { status: 201 });
  } catch (err) {
    // The bytes landed but the row didn't — clean up rather than leave a file
    // on the volume that nothing points at.
    await deleteStored(stored).catch(() => {});
    console.error("[documents] row insert failed:", err);
    return Response.json({ error: "Could not save that file." }, { status: 500 });
  }
}

/** So the client can show the ceiling before the user picks a 2GB video. */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ maxBytes: maxUploadBytes() });
}
