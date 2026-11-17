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

export type TabId = NumbersScope | "logo";

/**
 * The board's tabs, in loop order. Plain module: read by server pages and the
 * client loop alike. `scope` is what a share link must carry to see the tab;
 * null means every viewer gets it (the logo slide shows no numbers). `dwellMs`
 * is how long the loop stays before moving on.
 */
export const TABS: { id: TabId; scope: NumbersScope | null; label: string; path: string; dwellMs: number }[] = [
  { id: "product", scope: "product", label: "Drift", path: "", dwellMs: 30_000 },
  { id: "website", scope: "website", label: "Website", path: "/website", dwellMs: 30_000 },
  { id: "revenue", scope: "revenue", label: "Omsætning", path: "/revenue", dwellMs: 30_000 },
  { id: "logo", scope: null, label: "Logo", path: "/logo", dwellMs: 10_000 },
];

/** The tabs a viewer with these scopes sees, in loop order. */
export function tabsFor(scopes: readonly NumbersScope[]) {
  return TABS.filter((t) => t.scope === null || scopes.includes(t.scope));
}

export function scopeHref(scope: NumbersScope, base: string) {
  return base + TABS.find((t) => t.scope === scope)!.path;
}
