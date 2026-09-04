import crypto from "node:crypto";

// Pocket signs every delivery with HMAC-SHA256 over `{timestamp}.{rawBody}`,
// hex-encoded, in `X-HeyPocket-Signature`. The timestamp rides along in
// `X-HeyPocket-Timestamp` as Unix milliseconds.
//
// Two things here are easy to get wrong and silently fatal:
//
//   1. The MAC covers the RAW BYTES we received. Parsing the JSON and
//      re-serialising it reorders keys and changes whitespace, and then every
//      signature fails. The route must call `req.text()` and never
//      `req.json()`.
//   2. `crypto.timingSafeEqual` THROWS when the buffers differ in length, so a
//      truncated or garbage signature would 500 instead of 401. Length is
//      compared first, which is not a leak: the length of a hex SHA-256 is a
//      constant everyone already knows.

/** How far out of date a delivery may be before it's treated as a replay. */
const MAX_SKEW_MS = 5 * 60 * 1000;

export type VerifyFailure =
  | "missing-signature"
  | "missing-timestamp"
  | "bad-timestamp"
  | "stale"
  | "mismatch";

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

/**
 * Only `mismatch` depends on which secret was tried. The others are properties
 * of the request itself, so trying a second connection's secret cannot help.
 */
export function isSecretSpecific(reason: VerifyFailure): boolean {
  return reason === "mismatch";
}

export function signPocketPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyPocketSignature(input: {
  secret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  /** Injectable for tests. */
  now?: number;
}): VerifyResult {
  const { secret, rawBody, now = Date.now() } = input;

  if (!input.signature) return { ok: false, reason: "missing-signature" };
  if (!input.timestamp) return { ok: false, reason: "missing-timestamp" };

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "bad-timestamp" };
  if (Math.abs(now - sent) > MAX_SKEW_MS) return { ok: false, reason: "stale" };

  // Pocket's docs send the bare hex digest. Stripping an optional `sha256=`
  // prefix costs nothing and saves an afternoon if they ever add one.
  const provided = input.signature.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = signPocketPayload(secret, input.timestamp, rawBody);

  if (provided.length !== expected.length) return { ok: false, reason: "mismatch" };

  const equal = crypto.timingSafeEqual(
    Buffer.from(provided, "utf8"),
    Buffer.from(expected, "utf8"),
  );
  return equal ? { ok: true } : { ok: false, reason: "mismatch" };
}
