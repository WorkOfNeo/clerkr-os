import { db } from "@/lib/db";

// Public image-serving endpoint. URLs use unguessable UUIDs; treat as
// bearer-by-obscurity for internal use. Whitelisted in proxy.ts.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const img = await db.image.findUnique({
    where: { id },
    select: { bytes: true, mimeType: true },
  });
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(img.bytes, {
    headers: {
      "content-type": img.mimeType,
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(img.bytes.byteLength),
    },
  });
}
