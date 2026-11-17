import type { NumbersScope } from "@/lib/numbers/access";

/**
 * Where the board is mounted. A signed-in superadmin reads it at /numbers; a
 * share link reads the same tabs under /n/<token>, where the token in the path
 * is the credential (src/app/n/[token]). Every href on the board — the tabs,
 * the TV loop, the Drift poll — is built from the base, so a link viewer stays
 * on the link and never wanders onto /numbers and its sign-in.
 */
export const NUMBERS_BASE = "/numbers";
export const linkBase = (token: string) => `/n/${token}`;

/** The board's tabs, in loop order. Plain module: read by server pages and the client loop alike. */
export const TABS: { scope: NumbersScope; label: string; path: string }[] = [
  { scope: "product", label: "Drift", path: "" },
  { scope: "website", label: "Website", path: "/website" },
  { scope: "revenue", label: "Omsætning", path: "/revenue" },
];

export function scopeHref(scope: NumbersScope, base: string) {
  return base + TABS.find((t) => t.scope === scope)!.path;
}
