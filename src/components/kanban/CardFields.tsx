"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Link2, Ticket } from "lucide-react";

import { deleteCardAttachment, moveCard } from "@/app/kanban/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BoardCard, BoardColumn } from "./types";
import type { CardDraft } from "./useCardDraft";

// The pieces of an opened card that the side sheet and the full page both
// show. Each is laid out by its parent; these only own their own behaviour.

/** Move between columns without going back to the board. */
export function ColumnPills({ card, columns }: { card: BoardCard; columns: BoardColumn[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-1">
      {columns.map((c) => (
        <button
          key={c.id}
          onClick={() =>
            startTransition(async () => {
              await moveCard({ id: card.id, columnId: c.id });
              router.refresh();
            })
          }
          disabled={c.id === card.columnId || isPending}
          className={cn(
            "pressable rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
            c.id === card.columnId
              ? "bg-card shadow-xs ring-1 ring-hairline"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

/** Due, theme and blocked — the fields that save on blur. */
export function CardDetails({
  card,
  draft,
  stacked,
}: {
  card: BoardCard;
  draft: CardDraft;
  /** One field per row, for the full page's narrow side column. */
  stacked?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", stacked ? "grid-cols-1" : "grid-cols-2")}>
        <div>
          <label htmlFor={`card-due-${card.id}`} className="mb-1.5 block text-[13px] font-medium">
            Due
          </label>
          <Input
            id={`card-due-${card.id}`}
            type="date"
            value={draft.dueDate}
            onChange={(e) => draft.setDueDate(e.target.value)}
            onBlur={() => void draft.save()}
          />
        </div>
        <div>
          <label htmlFor={`card-theme-${card.id}`} className="mb-1.5 block text-[13px] font-medium">
            Theme
          </label>
          <Input
            id={`card-theme-${card.id}`}
            value={draft.themeTag}
            onChange={(e) => draft.setThemeTag(e.target.value)}
            onBlur={() => void draft.save()}
            placeholder="e.g. growth"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 p-3">
        <input
          type="checkbox"
          checked={draft.blocked}
          onChange={(e) => draft.setBlockedAndSave(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">Blocked</span>
          {draft.blocked && (
            <Input
              value={draft.blockerNote}
              onChange={(e) => draft.setBlockerNote(e.target.value)}
              onBlur={() => void draft.save()}
              placeholder="What's it waiting on?"
              className="mt-1.5 h-8 text-[13px]"
            />
          )}
        </span>
      </label>
    </div>
  );
}

export function CardAttachments({ card }: { card: BoardCard }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  if (card.attachments.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium">
        Attachments ({card.attachments.length})
      </span>
      <div className="flex flex-wrap gap-2">
        {card.attachments.map((a) => (
          <div key={a.id} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${a.id}`}
              alt={a.fileName}
              className="h-20 w-20 rounded-sm object-cover ring-1 ring-hairline"
            />
            <button
              onClick={() =>
                startTransition(async () => {
                  await deleteCardAttachment(a.id);
                  router.refresh();
                })
              }
              aria-label={`Remove ${a.fileName}`}
              className="pressable absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs shadow-sm ring-1 ring-hairline hover:text-destructive"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the card points back at: the ticket it was raised from (the report,
 *  with whoever asked and their screenshots) and the feature it serves. */
export function CardLinks({ card }: { card: BoardCard }) {
  if (!card.feature && !card.ticket) return null;
  return (
    <div className="space-y-1.5">
      {card.feature && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Linked to {card.feature.title}
        </p>
      )}
      {card.ticket && (
        <Link
          href={`/tickets/${card.ticket.slug}`}
          className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Ticket className="h-3.5 w-3.5 shrink-0" />
          From ticket <span className="font-mono">#{card.ticket.number}</span>
          <span className="truncate">{card.ticket.title}</span>
        </Link>
      )}
    </div>
  );
}
