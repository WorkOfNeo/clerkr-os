import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import type { TicketPriority, TicketStatus } from "@prisma/client";

const PILL =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <span className={cn(PILL, TICKET_STATUSES[status].className, className)}>
      {TICKET_STATUSES[status].label}
    </span>
  );
}

/**
 * Category colour is a hex from the DB, so it has to be an inline style —
 * Tailwind can't generate a class for a value it never sees at build time.
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
      <span className={cn(PILL, "text-muted-foreground ring-border", className)}>
        Uncategorised
      </span>
    );
  }
  return (
    <span
      className={cn(PILL, className)}
      style={{
        color: category.color,
        backgroundColor: `${category.color}14`,
        boxShadow: `inset 0 0 0 1px ${category.color}3d`,
      }}
    >
      {category.label}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  if (priority === "LOW" || priority === "MEDIUM") return null;
  return (
    <span className={cn("text-[11px] font-semibold", TICKET_PRIORITIES[priority].className)}>
      {TICKET_PRIORITIES[priority].label}
    </span>
  );
}
