"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Maximize2, Trash2 } from "lucide-react";

import { deleteCard } from "@/app/kanban/actions";
import { CardDocument } from "@/components/kanban/CardDocument";
import { CardAttachments, CardDetails, CardLinks, ColumnPills } from "@/components/kanban/CardFields";
import { ColumnIcon } from "@/components/kanban/ColumnIcon";
import { LedgerLinkField } from "@/components/kanban/LedgerLinkField";
import { SubtaskList } from "@/components/kanban/SubtaskList";
import { saveStateLabel, useCardDraft } from "@/components/kanban/useCardDraft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

import type { BoardCard, BoardColumn } from "./types";

/**
 * The card, opened in a side sheet — the quick look from the board. The same
 * card opens as a full page at /kanban/cards/[slug] for when it's a project
 * and the note is a document worth the whole screen; both are built from the
 * same pieces (useCardDraft, CardDocument, SubtaskList), so they save the same
 * way.
 *
 * The body is plain markdown, the same as a wiki note. Images pasted in are
 * stored as attachments and linked into the note by URL, so they render inline
 * and still can't be read by anyone without a session.
 */
export function CardPanel({
  card,
  columns,
  onClose,
}: {
  card: BoardCard | null;
  columns: BoardColumn[];
  onClose: () => void;
}) {
  return (
    <SheetContent
      open={Boolean(card)}
      onClose={onClose}
      title={card ? `#${card.number}` : "Card"}
      description={card?.title}
    >
      {card && <Body key={card.id} card={card} columns={columns} onClose={onClose} />}
    </SheetContent>
  );
}

function Body({
  card,
  columns,
  onClose,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const draft = useCardDraft(card);

  const column = columns.find((c) => c.id === card.columnId);

  return (
    <div className="space-y-5">
      <div>
        <Input
          value={draft.title}
          onChange={(e) => draft.setTitle(e.target.value)}
          onBlur={() => void draft.save()}
          aria-label="Title"
          className="h-auto border-0 bg-transparent px-0 text-[17px] font-semibold tracking-[-0.02em] shadow-none ring-0 focus:ring-0"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {column && (
            <span className="inline-flex items-center gap-1.5">
              <ColumnIcon name={column.icon} color={column.color} className="h-3 w-3" />
              {column.name}
            </span>
          )}
          {card.completedAt && <span className="text-success">done</span>}
          <Link
            href={`/kanban/cards/${card.slug}`}
            className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
            Open as page
          </Link>
        </div>
      </div>

      <ColumnPills card={card} columns={columns} />

      <SubtaskList cardId={card.id} subtasks={card.subtasks} />

      <CardDocument
        cardId={card.id}
        value={draft.body}
        onChange={draft.setBody}
        onBlur={() => void draft.save()}
        status={saveStateLabel(draft.saveState)}
      />

      <CardDetails card={card} draft={draft} />

      <LedgerLinkField card={card} />

      <CardAttachments card={card} />

      <CardLinks card={card} />

      <div className="flex justify-between border-t border-hairline pt-4">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await deleteCard(card.id);
              toast("Card deleted", { tone: "success" });
              onClose();
              router.refresh();
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button size="sm" onClick={() => void draft.save()} disabled={draft.saveState === "saving"}>
          {draft.saveState === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
