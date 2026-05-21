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
