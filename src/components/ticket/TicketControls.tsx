"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { updateTicket } from "@/app/tickets/actions";
import type { CategoryOption } from "@/components/ticket/NewTicketForm";
import { TICKET_PRIORITIES, TICKET_PRIORITY_ORDER, TICKET_STATUSES, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import type { TicketPriority, TicketStatus } from "@prisma/client";

export function TicketControls({
  ticketId,
  status,
  priority,
  categoryId,
  categories,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: string | null;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function save(patch: Parameters<typeof updateTicket>[0]) {
    startTransition(async () => {
      await updateTicket(patch);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Status"
        value={status}
        disabled={isPending}
        onChange={(e) => save({ id: ticketId, status: e.target.value as TicketStatus })}
        className={cn(
          "h-7 rounded-full border px-2 text-[11px] font-medium",
          TICKET_STATUSES[status].className,
        )}
      >
        {TICKET_STATUS_ORDER.map((s) => (
          <option key={s} value={s} className="bg-background text-foreground">
            {TICKET_STATUSES[s].label}
          </option>
        ))}
      </select>

      <select
        aria-label="Category"
        value={categoryId ?? ""}
        disabled={isPending}
        onChange={(e) => save({ id: ticketId, categoryId: e.target.value || null })}
        className="h-7 rounded-full border bg-background px-2 text-[11px] text-muted-foreground"
      >
        <option value="">Uncategorised</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Priority"
        value={priority}
        disabled={isPending}
        onChange={(e) => save({ id: ticketId, priority: e.target.value as TicketPriority })}
        className="h-7 rounded-full border bg-background px-2 text-[11px] text-muted-foreground"
      >
        {TICKET_PRIORITY_ORDER.map((p) => (
          <option key={p} value={p}>
            {TICKET_PRIORITIES[p].label}
          </option>
        ))}
      </select>
    </div>
  );
}
