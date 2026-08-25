import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import type { TicketPriority, TicketStatus } from "@prisma/client";

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const meta = TICKET_STATUSES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/**
 * Category colour comes from the DB row, so it has to be an inline style —
 * Tailwind can't generate a class for a hex it never sees at build time.
 */
export function CategoryBadge({
  category,
  className,
}: {
  category: { label: string; color: string } | null;
  className?: string;
}) {
  if (!category) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground",
          className,
        )}
      >
        Uncategorised
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        borderColor: `${category.color}66`,
        backgroundColor: `${category.color}1a`,
        color: category.color,
      }}
    >
      {category.label}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  if (priority === "LOW" || priority === "MEDIUM") return null;
  return (
    <span className={cn("text-[11px] font-medium", TICKET_PRIORITIES[priority].className)}>
      {TICKET_PRIORITIES[priority].label}
    </span>
  );
}
