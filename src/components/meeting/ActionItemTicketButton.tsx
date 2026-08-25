"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendActionItemToTicket } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";

/** Raises a meeting action item as a ticket so it can be tracked to done. */
export function ActionItemTicketButton({
  actionItemId,
  ticketSlug,
}: {
  actionItemId: string;
  ticketSlug: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slug, setSlug] = useState(ticketSlug);

  if (slug) {
    return (
      <Link
        href={`/tickets/${slug}`}
        className="shrink-0 text-xs text-muted-foreground hover:underline"
      >
        Ticket →
      </Link>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="shrink-0 text-xs"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await sendActionItemToTicket(actionItemId);
          setSlug(res.slug);
          router.refresh();
        })
      }
    >
      {isPending ? "Raising…" : "→ Raise ticket"}
    </Button>
  );
}
