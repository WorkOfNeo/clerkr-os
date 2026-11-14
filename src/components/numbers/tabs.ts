import type { NumbersScope } from "@/lib/numbers/access";

/** The board's tabs, in loop order. Plain module: read by server pages and the client loop alike. */
export const TABS: { scope: NumbersScope; label: string; href: string }[] = [
  { scope: "product", label: "Drift", href: "/numbers" },
  { scope: "website", label: "Website", href: "/numbers/website" },
  { scope: "revenue", label: "Omsætning", href: "/numbers/revenue" },
];

export function scopeHref(scope: NumbersScope) {
  return TABS.find((t) => t.scope === scope)!.href;
}
