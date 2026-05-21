import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { db } from "./db";

const TOKEN_BYTES = 32;
const PREFIX_LEN = 12;
const BCRYPT_COST = 10;

export interface IssuedToken {
  id: string;
  raw: string;
}

/**
 * Issue a new API token for `userId`. Returns the raw token (shown to the
 * user ONCE) plus the row id. Only the bcrypt hash and a short lookup prefix
 * are persisted.
 */
export async function issueApiToken(userId: string, name: string): Promise<IssuedToken> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const prefix = raw.slice(0, PREFIX_LEN);
  const tokenHash = await bcrypt.hash(raw, BCRYPT_COST);

  const row = await db.apiToken.create({
    data: { userId, name, tokenHash, tokenPrefix: prefix },
    select: { id: true },
  });

  return { id: row.id, raw };
}

/**
 * Verify a raw bearer token. Returns the owning userId on success, or null.
 * Looks up the candidate row by the unique `tokenPrefix` (cheap), then
 * bcrypt-compares against the stored hash (timing-safe).
 */
export async function verifyApiToken(raw: string): Promise<string | null> {
  if (!raw || raw.length < PREFIX_LEN) return null;
  const prefix = raw.slice(0, PREFIX_LEN);

  const row = await db.apiToken.findUnique({
    where: { tokenPrefix: prefix },
    select: { id: true, userId: true, tokenHash: true },
  });
  if (!row) return null;

  const ok = await bcrypt.compare(raw, row.tokenHash);
  if (!ok) return null;

  // Fire-and-forget; don't block the MCP call on the timestamp update.
  void db.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return row.userId;
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<void> {
  // Scope by userId so users can only revoke their own tokens.
  await db.apiToken.deleteMany({ where: { id: tokenId, userId } });
}

export async function listApiTokens(userId: string) {
  return db.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}
