import { verifyApiToken } from "@/lib/api-tokens";

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

/**
 * Validate a raw token and return the owning userId, or null. Wraps
 * `verifyApiToken` from the api-tokens module — this exists so the MCP
 * routes have a stable import path even if token storage changes.
 */
export async function authenticateMcp(rawToken: string | null): Promise<string | null> {
  if (!rawToken) return null;
  return verifyApiToken(rawToken);
}
