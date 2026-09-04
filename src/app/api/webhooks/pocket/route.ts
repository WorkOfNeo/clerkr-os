import { after } from "next/server";

import { db } from "@/lib/db";
import { ingestPocketRecording, readPocketMeeting } from "@/lib/pocket/ingest";
import { actionForEvent, pocketWebhookSchema } from "@/lib/pocket/payload";
import {
  isSecretSpecific,
  verifyPocketSignature,
  type VerifyFailure,
} from "@/lib/pocket/verify";

// POST /api/webhooks/pocket — where a Pocket recording lands.
//
// A route handler rather than a server action, for the same reason as
// /api/mcp: this is machine-to-machine, there is no session cookie, and the
// caller is not our own client. The HMAC check below is the security boundary.
//
// It MUST be in the allowlist in src/proxy.ts. Without that, the proxy 307s it
// to /signin, Pocket receives an HTML sign-in page instead of a webhook
// response, and every meeting is silently dropped — the exact failure that
// took a day to find on /api/mcp.

/** Signature covers the raw bytes, so nothing may re-serialise the body. */
export const dynamic = "force-dynamic";

interface Ack {
  ok: boolean;
  [key: string]: unknown;
}

function json(body: Ack, status = 200) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  // Raw first, ALWAYS. `req.json()` here would make every signature fail.
  const rawBody = await req.text();
  const signature = req.headers.get("x-heypocket-signature");
  const timestamp = req.headers.get("x-heypocket-timestamp");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "Body is not JSON." }, 400);
  }

  const parsed = pocketWebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json({ ok: false, error: "Unrecognised Pocket payload." }, 400);
  }
  const payload = parsed.data;

  const resolved = await resolveConnection({
    email: payload.user?.email ?? null,
    rawBody,
    signature,
    timestamp,
  });

  if (!resolved.connection) {
    console.warn(`[pocket] rejected delivery: ${resolved.reason}`);
    return json({ ok: false, error: `Signature check failed (${resolved.reason}).` }, 401);
  }

  const connection = resolved.connection;
  const action = connection.active ? actionForEvent(payload.event) : "ignore";

  if (action === "ignore") {
    // A 2xx even for events we drop: anything else and Pocket retries three
    // times to deliver something we are never going to want.
    await touch(connection.id, payload.event, null);
    return json({
      ok: true,
      ignored: true,
      reason: connection.active ? "event not handled" : "connection paused",
    });
  }

  try {
    const result = await ingestPocketRecording({ connection, payload, mode: action });

    if (result.status === "skipped") {
      await touch(connection.id, payload.event, null);
      return json({ ok: true, ignored: true, reason: result.reason });
    }

    await touch(connection.id, payload.event, null, result.status === "created");

    // Only a fresh ingest is worth an LLM pass. A refresh already has its
    // cards, and re-reading on every speaker relabel would be a call per edit.
    if (action === "ingest") {
      after(async () => {
        await readPocketMeeting({
          meetingId: result.meetingId,
          userId: connection.userId,
        });
      });
    }

    return json({
      ok: true,
      meetingId: result.meetingId,
      status: result.status,
      href: `/meetings/${result.meetingId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pocket] ingest failed:", err);
    await touch(connection.id, payload.event, message);
    // 500 so Pocket retries — a database blip should not cost a meeting.
    return json({ ok: false, error: "Failed to file the recording." }, 500);
  }
}

/** Pocket's "send a test payload" button issues a GET on some setups. */
export async function GET() {
  return json({ ok: true, endpoint: "pocket-webhook" });
}

type Connection = {
  id: string;
  userId: string;
  defaultKind: "INTERNAL" | "CUSTOMER" | "PROSPECT";
  active: boolean;
  secret: string;
  pocketEmail: string;
};

/**
 * Work out which connection sent this, by checking the signature.
 *
 * The email in the payload only decides what to TRY FIRST. If it doesn't match
 * any connection we still try every secret, because a Pocket account whose
 * email differs from the one typed into settings would otherwise drop meetings
 * with nothing to show for it. The signature is what actually authorises.
 */
async function resolveConnection(input: {
  email: string | null;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): Promise<{ connection: Connection | null; reason: VerifyFailure | "no-connections" }> {
  const connections = await db.pocketConnection.findMany({
    select: {
      id: true,
      userId: true,
      defaultKind: true,
      active: true,
      secret: true,
      pocketEmail: true,
    },
  });
  if (connections.length === 0) return { connection: null, reason: "no-connections" };

  const email = input.email?.trim().toLowerCase() ?? null;
  const ordered = email
    ? [...connections].sort(
        (a, b) => matchesEmail(b, email) - matchesEmail(a, email),
      )
    : connections;

  let reason: VerifyFailure = "mismatch";
  for (const candidate of ordered) {
    const result = verifyPocketSignature({
      secret: candidate.secret,
      signature: input.signature,
      timestamp: input.timestamp,
      rawBody: input.rawBody,
    });
    if (result.ok) return { connection: candidate, reason: "mismatch" };
    reason = result.reason;
    // A stale timestamp or a missing header is about the request, not the
    // secret — trying the rest would only burn CPU on the same answer.
    if (!isSecretSpecific(result.reason)) break;
  }
  return { connection: null, reason };
}

function matchesEmail(c: Connection, email: string): number {
  return c.pocketEmail.trim().toLowerCase() === email ? 1 : 0;
}

/** Record what happened, so /settings/pocket can answer "is this working?". */
async function touch(
  id: string,
  event: string,
  error: string | null,
  createdMeeting = false,
): Promise<void> {
  try {
    await db.pocketConnection.update({
      where: { id },
      data: {
        lastEventAt: new Date(),
        lastEvent: event,
        lastError: error,
        deliveries: { increment: 1 },
        ...(createdMeeting ? { meetingsCreated: { increment: 1 } } : {}),
      },
    });
  } catch (err) {
    console.warn("[pocket] could not record delivery:", err);
  }
}
