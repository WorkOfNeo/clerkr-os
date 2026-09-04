/**
 * Normalize a base-URL string. Defensive: if someone set
 * BETTER_AUTH_URL=clerkr-os-production.up.railway.app without a protocol,
 * Better Auth throws `Invalid base URL` at module load (which then crashes
 * the build because client components SSR'd during prerender trigger it).
 */
export function ensureProtocol(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * The origin this app is actually being served from, for URLs a user has to
 * paste into someone else's dashboard (an MCP client, a Pocket webhook).
 * Prefers BETTER_AUTH_URL and falls back to the forwarded request headers, so
 * it is right in local dev and behind Railway's proxy without configuration.
 */
export async function currentOrigin(): Promise<string> {
  const fromEnv = ensureProtocol(process.env.BETTER_AUTH_URL);
  if (fromEnv) return fromEnv;

  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
