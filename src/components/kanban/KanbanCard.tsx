"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Flag, Link2, Paperclip } from "lucide-react";

import { ConfidenceMeter } from "@/components/kanban/ConfidenceMeter";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { BoardCard } from "./types";

/**
 * One card. Two lines of identity — title and the thing it belongs to — then a
 * single meta row of small affordances, which is what keeps a column of twelve
 * scannable rather than a wall of text.
 *
 * The whole body is the drag handle. `activationConstraint` on the sensor gives
 * the ~4px of hysteresis that keeps a click a click.
 */
export function KanbanCard({
  card,
  accent,
  onOpen,
  overlay,
}: {
  card: BoardCard;
  accent: string;
  onOpen?: (card: BoardCard) => void;
  /** Rendered inside DragOverlay — no sortable wiring, no hover affordances. */
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: card.id, disabled: overlay });

  const due = card.dueDate ? new Date(card.dueDate) : null;
  const overdue = due ? due.getTime() < Date.now() && !card.completedAt : false;
  const today = due ? isToday(due) : false;

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={
        overlay
          ? undefined
          : { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
      }
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      onClick={() => onOpen?.(card)}
      className={cn(
        "group relative w-full cursor-grab select-none rounded-lg bg-card p-3 text-left active:cursor-grabbing",
        "shadow-[0_0_0_1px_hsl(var(--hairline)),0_1px_2px_rgb(0_0_0/0.04)]",
        "transition-[box-shadow,transform] duration-200 ease-apple",
        "hover:shadow-[0_0_0_1px_hsl(var(--foreground)/0.08),0_6px_16px_-6px_rgb(0_0_0/0.12)]",
        // The original is left in place at low opacity so the column doesn't
        // reflow out from under the card being dragged.
        !overlay && sortable.isDragging && "opacity-40",
        overlay && "cursor-grabbing shadow-[0_0_0_1px_hsl(var(--hairline)),0_24px_48px_-12px_rgb(0_0_0/0.28)]",
      )}
    >
      {/* Blocked is the one state worth a colour bar — it means someone else
          has to act before this can move. */}
      {card.blocked && (
        <span
          className="absolute inset-x-0 top-0 h-[3px] rounded-t-lg bg-destructive"
          aria-hidden
        />
      )}

      <p className="line-clamp-2 text-[13.5px] font-medium leading-snug tracking-[-0.01em]">
        {card.title}
      </p>

      {(card.feature || card.themeTag || card.description) && (
        <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-muted-foreground">
          {card.feature?.title ?? card.themeTag ?? card.description}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Flag
          className={cn("h-3.5 w-3.5 shrink-0", card.blocked ? "text-destructive" : "text-success")}
          strokeWidth={2}
          aria-label={card.blocked ? "Blocked" : "Not blocked"}
        />

        {due && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums",
              overdue && "bg-destructive/10 font-medium text-destructive",
              today && !overdue && "bg-warning/10 font-medium text-warning",
            )}
          >
            <CalendarDays className="h-3 w-3" />
            {today ? "Today" : formatShortDate(due)}
          </span>
        )}

        {card.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Paperclip className="h-3 w-3" />
            {card.attachments.length}
          </span>
        )}

        {card.feature && (
          <span className="inline-flex items-center gap-1" title={card.feature.title}>
            <Link2 className="h-3 w-3" />
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {card.confidence > 0 && <ConfidenceMeter value={card.confidence} />}
          <span
            className="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-black/5"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
