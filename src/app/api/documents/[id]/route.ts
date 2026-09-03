import { db } from "@/lib/db";
import { locatorSelect } from "@/lib/documents/documents";
import { canRenderInline, contentDisposition } from "@/lib/documents/file-types";
import { openStored } from "@/lib/documents/storage";
import { getSession } from "@/lib/session";

/**
 * Serves document bytes. Binary out, not data for a component — the same
 * exception to "server actions only" as /api/attachments/[id], and behind the
 * session cookie for the same reason: these are original files and can contain
 * client matter.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `bytes=0-1023` / `bytes=1024-`. Returns null when absent or unusable, in
 *  which case we just serve the whole file. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix form: the LAST n bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id }, select: locatorSelect });
  if (!doc) return new Response("Not found", { status: 404 });

  // Anything we're not certain is inert downloads instead of rendering. An
  // uploaded .html or .svg served inline would run as our own origin against
  // the session cookie — see INLINE_SAFE in file-types.ts.
  const wantsDownload = new URL(req.url).searchParams.has("download");
  const inline = !wantsDownload && canRenderInline(doc.mimeType);

  const headers = new Headers({
    "Content-Type": doc.mimeType,
    "Content-Disposition": contentDisposition(doc.fileName, inline ? "inline" : "attachment"),
    // Never let a browser second-guess the type we declared.
    "X-Content-Type-Options": "nosniff",
    // Belt and braces on top of the allowlist: an inline document gets no
    // scripts, no network, no same-origin privileges.
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    // Bytes at this id never change, so cache hard — but privately: this is
    // behind auth and must not land in a shared cache.
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  });

  try {
    const range = parseRange(req.headers.get("range"), doc.byteSize);
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${doc.byteSize}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(await openStored(doc, range), { status: 206, headers });
    }

    headers.set("Content-Length", String(doc.byteSize));
    return new Response(await openStored(doc), { headers });
  } catch (err) {
    // A row whose bytes have gone missing — a volume that isn't mounted, or a
    // file deleted underneath us. Say so rather than serving a broken stream.
    console.error(`[documents] could not read ${id}:`, err);
    return new Response("Document bytes are unavailable", { status: 503 });
  }
}
