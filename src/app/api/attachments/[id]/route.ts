import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Serves attachment bytes. A route handler rather than a server action because
// this returns binary, not data for a component — the "server actions only"
// rule in CLAUDE.md is about mutations. Auth is the normal session cookie:
// screenshots can contain client matter, so they never go out unauthenticated.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const att = await db.attachment.findUnique({
    where: { id },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!att) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(att.data), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `inline; filename="${att.fileName.replace(/"/g, "")}"`,
      // Bytes at this id never change, so cache hard — but privately: this is
      // behind auth and must not land in a shared cache.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
