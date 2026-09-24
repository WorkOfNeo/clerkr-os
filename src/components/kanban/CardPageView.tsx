"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, PanelRight, Trash2 } from "lucide-react";

import { deleteCardFromPage } from "@/app/kanban/actions";
import { CardDocument } from "@/components/kanban/CardDocument";
import { CardAttachments, CardDetails, CardLinks, ColumnPills } from "@/components/kanban/CardFields";
import { ColumnIcon } from "@/components/kanban/ColumnIcon";
import { LedgerLinkField } from "@/components/kanban/LedgerLinkField";
import { SubtaskList } from "@/components/kanban/SubtaskList";
import { saveStateLabel, useCardDraft } from "@/components/kanban/useCardDraft";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { BoardCard, BoardColumn } from "./types";

/**
 * The full-page card: the document in the middle, the fields in a side
 * column. Same pieces as the side sheet (see CardPanel), laid out for writing.
 */
export function CardPageView({
  card,
  columns,
  board,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  board: { id: string; slug: string; name: string };
}) {
  const draft = useCardDraft(card);
  const column = columns.find((c) => c.id === card.columnId);
  const boardHref = `/kanban?board=${board.slug}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <Link
          href={boardHref}
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {board.name}
        </Link>
        <span
          className={cn(
            "ml-auto text-[12px]",
            draft.saveState === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {saveStateLabel(draft.saveState)}
        </span>
        <Link
          href={`${boardHref}&card=${card.id}`}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="h-3.5 w-3.5" />
          Show on board
        </Link>
      </div>

      <header className="mt-4">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="font-mono">#{card.number}</span>
          {column && (
            <span className="inline-flex items-center gap-1.5">
              <ColumnIcon name={column.icon} color={column.color} className="h-3 w-3" />
              {column.name}
            </span>
          )}
          {card.completedAt && <span className="text-success">done</span>}
        </div>
        <TitleField
          value={draft.title}
          onChange={draft.setTitle}
          onCommit={() => void draft.save()}
        />
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-7">
          <ColumnPills card={card} columns={columns} />
          <SubtaskList cardId={card.id} subtasks={card.subtasks} />
          <CardDocument
            cardId={card.id}
            value={draft.body}
            onChange={draft.setBody}
            onBlur={() => void draft.save()}
            size="page"
          />
        </div>

        <aside className="space-y-6 self-start lg:sticky lg:top-6">
          <CardDetails card={card} draft={draft} stacked />
          <LedgerLinkField card={card} />
          <CardLinks card={card} />
          <CardAttachments card={card} />
          <DeleteCard cardId={card.id} />
        </aside>
      </div>
    </>
  );
}

/** The title as the page's heading, editable in place. A textarea so a long
 *  title wraps like a heading instead of scrolling sideways. */
function TitleField({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onBlur={onCommit}
      onKeyDown={(e) => {
        // A title is one line; Enter means "done with the title".
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      aria-label="Title"
      className="text-display mt-1 w-full resize-none overflow-hidden bg-transparent text-[28px] font-semibold leading-[1.2] focus:outline-none"
    />
  );
}

function DeleteCard({ cardId }: { cardId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border-t border-hairline pt-4">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-muted-foreground">Delete this card and its subtasks?</span>
          <Button
            size="xs"
            variant="destructive"
            disabled={isPending}
            onClick={() => startTransition(() => deleteCardFromPage(cardId))}
          >
            Delete
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete card
        </Button>
      )}
    </div>
  );
}
