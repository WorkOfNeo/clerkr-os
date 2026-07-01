// Shared date formatters. Fixed locale ("en-US") to avoid SSR/CSR hydration
// mismatches in components rendered on both sides (React error #418).

export function formatShortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatISODate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatShortDate(start)} → ${formatShortDate(end)}`;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
