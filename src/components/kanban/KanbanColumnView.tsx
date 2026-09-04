"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { motion } from "motion/react";
import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";

import { ColumnIcon } from "@/components/kanban/ColumnIcon";
import { CardContextMenu } from "@/components/kanban/CardContextMenu";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useIsTouch } from "@/lib/use-is-touch";
import { cn } from "@/lib/utils";

import type { BoardCard, BoardColumn } from "./types";

/**
 * A column is a droppable region plus its own quick-add. The header carries the
 * column's identity (icon + colour), its count, and the two controls that
 * belong to it — add here, and edit this column — because a control should sit
 * next to the thing it changes.
 */
export function KanbanColumnView({
  column,
  cards,
  onQuickAdd,
  onEdit,
  onOpenCard,
  onSetDefault,
  onDelete,
  subscribed,
  allColumns,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  /** Card ids this person follows — drives the right-click menu's wording. */
  subscribed: Set<string>;
  allColumns: BoardColumn[];
  onQuickAdd: (columnId: string, title: string) => void;
  onEdit: (column: BoardColumn) => void;
  onOpenCard: (card: BoardCard) => void;
  onSetDefault: (columnId: string) => void;
  onDelete: (column: BoardColumn) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { columnId: column.id } });
  const isTouch = useIsTouch();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const overLimit = column.wipLimit !== null && cards.length > column.wipLimit;

  function commit() {
    const title = draft.trim();
    if (title) onQuickAdd(column.id, title);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex w-[86vw] max-w-[320px] shrink-0 snap-start flex-col sm:w-[290px]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <ColumnIcon name={column.icon} color={column.color} />
        <h3 className="text-[13px] font-semibold tracking-[-0.01em]">{column.name}</h3>
        <span
          className={cn(
            "text-[12px] tabular-nums",
            overLimit ? "font-semibold text-warning" : "text-muted-foreground",
          )}
          title={
            column.wipLimit !== null
              ? `${cards.length} of a ${column.wipLimit} card limit`
              : undefined
          }
        >
          {cards.length}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>
        {column.isDone && (
          <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
            Done
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="pressable rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`${column.name} column options`}
                title={`${column.name} options`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => onEdit(column)}>Edit column…</DropdownMenuItem>
              <DropdownMenuItem
                disabled={column.isDefault}
                onSelect={() => onSetDefault(column.id)}
              >
                {column.isDefault ? "Default for new cards" : "Make default"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => onDelete(column)}
              >
                Delete column…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip label={`Add to ${column.name}`}>
            <button
              onClick={() => setAdding(true)}
              className="pressable rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Add a card to ${column.name}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "scroll-soft flex min-h-[140px] flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-xl p-2 transition-colors duration-200 ease-apple",
          // Bounded so the column scrolls internally instead of pushing the
          // page taller than the screen, which is what made the lower cards
          // unreachable on a phone.
          "max-h-[calc(100dvh-16rem)] sm:max-h-[calc(100dvh-19rem)]",
          // The drop target lights up rather than outlining — a ring on a
          // container this large reads as an error state.
          isOver ? "bg-primary/[0.06]" : "bg-muted/45",
        )}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <motion.div key={card.id} layout transition={SPRING}>
              <CardContextMenu
                card={card}
                columns={allColumns}
                subscribed={subscribed.has(card.id)}
              >
                <div>
                  <KanbanCard card={card} accent={column.color} onOpen={onOpenCard} />
                </div>
              </CardContextMenu>
            </motion.div>
          ))}
        </SortableContext>

        {adding && (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // Same rule as the composer: on a phone Return is the newline
              // key, so quick-add commits on blur there rather than firing off
              // a half-typed card.
              if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="What needs doing?"
            className="w-full resize-none rounded-lg bg-card p-3 text-[13.5px] leading-snug shadow-[0_0_0_1px_hsl(var(--hairline))] placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
        )}

        {cards.length === 0 && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex flex-1 items-center justify-center rounded-lg py-6 text-[12px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          >
            Drop a card here, or click to add
          </button>
        )}
      </div>
    </div>
  );
}

// Critically damped — a card settling into a column shouldn't overshoot,
// because nothing threw it there.
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };
