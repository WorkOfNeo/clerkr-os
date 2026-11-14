import { recordRevenueDay } from "@/lib/numbers/revenue";
import { IngestPayload, acceptedEnvironments, storeLinks, storeOps, storeSnapshot, verifySignature } from "@/lib/numbers/snapshot";

/**
 * Receives what the Clerkr prod worker pushes: the ops-board snapshot and the
 * share-link list every 30 s (kinds "ops", "links") and the stats snapshot
 * every 5 min (kind "stats": counts + firms with their revenue fields).
 * Nothing here is ever edited by hand — app.clerkr.ai is where things change. Machine to
 * machine, so it sits outside the session gate (src/proxy.ts) — the HMAC is the
 * boundary: no valid signature over `${timestamp}.${body}` with
 * STATS_INGEST_SECRET, or a timestamp more than five minutes off, and nothing
 * is read past the headers.
 *
 * This is the reason the board exists outside Clerkr: Clerkr sends, it never
 * listens.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_000_000;

export async function POST(req: Request) {
  const secret = process.env.STATS_INGEST_SECRET ?? "";
  if (!secret) return Response.json({ ok: false, error: "not configured" }, { status: 503 });

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "too large" }, { status: 413 });
  }

  const ok = verifySignature({
    secret,
    timestamp: req.headers.get("x-clerkr-timestamp"),
    signature: req.headers.get("x-clerkr-signature"),
    rawBody,
  });
  if (!ok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = IngestPayload.safeParse(json);
  if (!parsed.success) {
    // The issue paths only — never the values, which could be anything.
    const paths = parsed.error.issues.slice(0, 5).map((i) => i.path.join("."));
    console.error("[numbers] snapshot refused: schema", paths);
    return Response.json({ ok: false, error: "invalid payload", paths }, { status: 422 });
  }

  // Production only (STATS_ACCEPT_ENVS widens it for a local test run). A
  // snapshot from any other environment is refused, not stored and hidden —
  // so a dev worker pointed here by mistake leaves nothing behind.
  if (!acceptedEnvironments().includes(parsed.data.environment)) {
    return Response.json({ ok: false, error: "environment not accepted" }, { status: 403 });
  }

  if (parsed.data.kind === "links") {
    await storeLinks(parsed.data);
    return Response.json({ ok: true, kind: "links", links: parsed.data.links.length });
  }
  if (parsed.data.kind === "ops") {
    await storeOps(parsed.data);
    return Response.json({ ok: true, kind: "ops" });
  }
  await storeSnapshot(parsed.data);
  await recordRevenueDay();
  return Response.json({ ok: true, kind: "stats", firms: parsed.data.firms.length });
}
