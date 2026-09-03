"use client";

import { useRouter } from "next/navigation";

import { Segmented } from "@/components/ui/segmented";
import { TICKET_STATUSES, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";

export function TicketFilters({
  status,
  categorySlug,
  categories,
  counts,
}: {
  status?: string;
  categorySlug?: string;
  categories: { id: string; slug: string; label: string; color: string }[];
  counts: Record<string, number>;
}) {
  const router = useRouter();

  function href(next: { status?: string; category?: string }) {
    const sp = new URLSearchParams();
    const merged = { status, category: categorySlug, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const q = sp.toString();
    return q ? `/tickets?${q}` : "/tickets";
  }

  return (
    <>
      <Segmented
        layoutId="status-filter"
        value={status ?? "open"}
        onChange={(v) => router.push(href({ status: v === "open" ? undefined : v }))}
        segments={[
          { value: "open", label: "Open", count: counts.open },
          ...TICKET_STATUS_ORDER.map((s) => ({
            value: s,
            label: TICKET_STATUSES[s].label,
            count: counts[s],
          })),
          { value: "all", label: "All" },
        ]}
      />

      {categories.length > 0 && (
        <Segmented
          layoutId="category-filter"
          size="sm"
          value={categorySlug ?? ""}
          onChange={(v) => router.push(href({ category: v || undefined }))}
          segments={[
            { value: "", label: "Any" },
            ...categories.map((c) => ({ value: c.slug, label: c.label, color: c.color })),
          ]}
        />
      )}
    </>
  );
}
