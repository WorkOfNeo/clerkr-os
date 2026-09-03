"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MessageSquare, Paperclip } from "lucide-react";

import { updateTicket } from "@/app/tickets/actions";
import { CategoryBadge, PriorityLabel, StatusBadge } from "@/components/ticket/TicketBadges";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/format";
import { TICKET_STATUSES } from "@/lib/ticket-meta";

import type { TicketPriority, TicketStatus } from "@prisma/client";

export interface TicketRow {
  id: string;
  slug: string;
  number: number;
  title: string;
  body: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  reportedBy: string | null;
  createdAt: Date;
  category: { id: string; slug: string; label: string; color: string } | null;
  author: { email: string; name: string };
  _count: { comments: number; attachments: number };
}

/**
 * The queue. Rows stagger in, and each one can be dragged left to resolve it
 * without opening it — the fastest possible path for the common case of
 * "I know what this is, it's done".
 */
export function TicketList({ tickets }: { tickets: TicketRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  function resolve(t: TicketRow) {
    const previous = t.status;
    startTransition(async () => {
      await updateTicket({ id: t.id, status: "SHIPPED" });
      router.refresh();
      toast(`#${t.number} marked shipped`, {
        tone: "success",
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              await updateTicket({ id: t.id, status: previous });
              router.refresh();
            }),
        },
      });
    });
  }

  // The row stagger is a CSS animation rather than a motion one, and it animates
  // transform ONLY — never opacity. A fade-in leaves the entire queue invisible
  // if the animation never runs (no JS, a frozen timeline, a background tab);
  // a transform that never runs just leaves the rows a few pixels low.
  return (
    <ul className="space-y-2">
      {tickets.map((t, i) => (
        <li
          key={t.id}
          className="relative animate-row-in"
          style={{ animationDelay: `${Math.min(i * 22, 300)}ms` }}
        >
          {/* Revealed as the row is dragged aside. */}
          {!TICKET_STATUSES[t.status].resolved && (
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] font-medium text-success">
              Mark shipped
            </div>
          )}

          <motion.div
            drag={TICKET_STATUSES[t.status].resolved ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.5, right: 0 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.x < -110) resolve(t);
            }}
            className="relative"
          >
            <Link href={`/tickets/${t.slug}`} className="surface-interactive block p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[15px] font-medium tracking-[-0.01em]">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    #{t.number}
                  </span>
                  {t.title}
                </h2>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PriorityLabel priority={t.priority} />
                  <CategoryBadge category={t.category} />
                  <StatusBadge status={t.status} />
                </div>
              </div>

              {t.body && (
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                  {t.body}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatShortDate(t.createdAt)}</span>
                <span>{t.reportedBy ?? (t.author.name || t.author.email)}</span>
                {t._count.comments > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {t._count.comments}
                  </span>
                )}
                {t._count.attachments > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {t._count.attachments}
                  </span>
                )}
              </div>
            </Link>
          </motion.div>
        </li>
      ))}
    </ul>
  );
}
