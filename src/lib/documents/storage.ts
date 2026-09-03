import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

import type { DocumentStorage } from "@prisma/client";

/**
 * Where document bytes live.
 *
 * Two backends, chosen per row rather than globally so switching one on doesn't
 * strand the files already stored the other way:
 *
 *   POSTGRES (default) — bytes in a `bytea` column. Nothing to provision: it
 *     works on a fresh clone and on Railway the moment the app boots, and the
 *     files are included in the normal database backup. The whole file has to
 *     be materialised in memory to read or write it, which is why it isn't the
 *     right answer once the files get big.
 *
 *   VOLUME — bytes on disk under DOCUMENTS_DIR, which on Railway is a mounted
 *     volume. Uploads stream straight to disk and downloads stream back, so
 *     memory use is flat regardless of file size, and a 200MB video costs the
 *     database nothing.
 *
 * To move to a volume: attach one to the Railway service, mount it at /data,
 * and set DOCUMENTS_DIR=/data/documents. Rows written before the switch keep
 * serving from Postgres — `Document.storage` records which is which.
 */

const DEFAULT_MAX_MB = 50;

/** Absolute path of the volume root, or null when running on Postgres. */
export function documentsDir(): string | null {
  const dir = process.env.DOCUMENTS_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

export function activeBackend(): DocumentStorage {
  return documentsDir() ? "VOLUME" : "POSTGRES";
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.DOCUMENTS_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB) * 1024 * 1024;
}

/** One-line description of the active backend, shown in the UI so where the
 *  files went is never a mystery. */
export function backendLabel(): string {
  const dir = documentsDir();
  return dir ? `volume · ${dir}` : "Postgres";
}

/**
 * Boot check for the volume backend. The failure this exists to catch is silent
 * and total: if DOCUMENTS_DIR points at a volume that was never attached,
 * `mkdir -p` cheerfully creates the path on the container's ephemeral disk,
 * uploads appear to succeed, and every file vanishes on the next redeploy with
 * the database rows still pointing at them.
 *
 * A mounted Railway volume means its MOUNT POINT already exists — /data for a
 * DOCUMENTS_DIR of /data/documents. The mount point missing is the tell that
 * nothing was attached, so say so loudly rather than losing files quietly.
 */
export async function checkStorageReady(): Promise<
  { ok: true; backend: DocumentStorage } | { ok: false; problem: string }
> {
  const dir = documentsDir();
  if (!dir) return { ok: true, backend: "POSTGRES" };

  const mountPoint = path.dirname(dir);
  try {
    const info = await stat(mountPoint);
    if (!info.isDirectory()) {
      return { ok: false, problem: `${mountPoint} exists but is not a directory.` };
    }
  } catch {
    return {
      ok: false,
      problem:
        `DOCUMENTS_DIR is ${dir} but ${mountPoint} does not exist — the Railway volume ` +
        `is probably not attached. Uploads would land on the container's ephemeral disk ` +
        `and be lost on the next deploy. Attach a volume mounted at ${mountPoint}, or ` +
        `unset DOCUMENTS_DIR to keep documents in Postgres.`,
    };
  }

  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    return { ok: false, problem: `${dir} is not writable: ${(err as Error).message}` };
  }
  return { ok: true, backend: "VOLUME" };
}

export class UploadTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`File is larger than the ${Math.round(limitBytes / 1024 / 1024)}MB limit.`);
    this.name = "UploadTooLargeError";
  }
}

export interface StoredUpload {
  id: string;
  storage: DocumentStorage;
  storageKey: string | null;
  data: Buffer<ArrayBuffer> | null;
  byteSize: number;
  checksum: string;
}

/** A row shaped enough to locate its bytes — anything with these three fields. */
export interface StoredLocator {
  storage: DocumentStorage;
  storageKey: string | null;
  byteSize: number;
}

/**
 * Counts bytes and hashes them as they pass through, and aborts the moment the
 * limit is crossed — so an oversized upload is rejected mid-flight rather than
 * after we've already written it all to disk.
 */
function meter(limit: number, hash: ReturnType<typeof createHash>, onSize: (n: number) => void) {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.byteLength;
      if (size > limit) {
        cb(new UploadTooLargeError(limit));
        return;
      }
      hash.update(chunk);
      onSize(size);
      cb(null, chunk);
    },
  });
}

/** Where a document's bytes go inside the volume. Sharded by month so one
 *  directory never accumulates tens of thousands of entries. */
function keyFor(id: string, fileName: string): string {
  const now = new Date();
  const ext = path.extname(fileName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${month}/${id}${ext}`;
}

/** Resolve a storage key to an absolute path, refusing anything that escapes
 *  the volume root — the key comes out of the database, but a traversal bug
 *  upstream must not turn into reading /etc/passwd. */
function absolutePath(storageKey: string): string {
  const root = documentsDir();
  if (!root) throw new Error("DOCUMENTS_DIR is not set — this row's bytes are on a volume.");
  const abs = path.resolve(root, storageKey);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside the documents directory: ${storageKey}`);
  }
  return abs;
}

/**
 * Consume an upload body and put the bytes wherever the active backend says.
 * Returns everything the `document` row needs; the caller creates the row and
 * is responsible for calling `deleteStored` if that insert then fails.
 */
export async function storeUpload(
  body: ReadableStream<Uint8Array> | null,
  fileName: string,
): Promise<StoredUpload> {
  if (!body) throw new Error("Upload had no body.");

  const id = randomUUID();
  const limit = maxUploadBytes();
  const hash = createHash("sha256");
  let byteSize = 0;
  const source = Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>);
  const metered = meter(limit, hash, (n) => (byteSize = n));

  if (activeBackend() === "VOLUME") {
    const storageKey = keyFor(id, fileName);
    const abs = absolutePath(storageKey);
    await mkdir(path.dirname(abs), { recursive: true });
    try {
      await pipeline(source, metered, createWriteStream(abs));
    } catch (err) {
      // A rejected or interrupted upload must not leave a partial file behind.
      await rm(abs, { force: true }).catch(() => {});
      throw err;
    }
    return { id, storage: "VOLUME", storageKey, data: null, byteSize, checksum: hash.digest("hex") };
  }

  const chunks: Buffer[] = [];
  await pipeline(source, metered, async function (stream) {
    for await (const chunk of stream) chunks.push(chunk as Buffer);
  });
  // Prisma's Bytes input is Uint8Array<ArrayBuffer>; Buffer.concat already
  // returns that narrow type, so don't widen it (see decode-data-url.ts).
  const data: Buffer<ArrayBuffer> = Buffer.concat(chunks);
  return { id, storage: "POSTGRES", storageKey: null, data, byteSize, checksum: hash.digest("hex") };
}

/**
 * Open a stored document for reading, optionally a byte range — PDF viewers
 * request ranges to seek, and honouring them means a 60MB brief opens on page
 * one instead of after the whole file lands.
 */
export async function openStored(
  doc: StoredLocator & { id: string },
  range?: { start: number; end: number },
): Promise<ReadableStream<Uint8Array>> {
  if (doc.storage === "VOLUME") {
    if (!doc.storageKey) throw new Error(`Document ${doc.id} has no storageKey.`);
    const stream = createReadStream(absolutePath(doc.storageKey), range);
    return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  }

  const { db } = await import("@/lib/db");
  const row = await db.document.findUnique({ where: { id: doc.id }, select: { data: true } });
  if (!row?.data) throw new Error(`Document ${doc.id} has no stored bytes.`);
  const bytes = range
    ? new Uint8Array(row.data.subarray(range.start, range.end + 1))
    : new Uint8Array(row.data);
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

/** Remove the bytes behind a document. The row itself is the caller's job. */
export async function deleteStored(doc: StoredLocator): Promise<void> {
  if (doc.storage !== "VOLUME" || !doc.storageKey) return; // POSTGRES: the row is the bytes.
  await rm(absolutePath(doc.storageKey), { force: true });
}
