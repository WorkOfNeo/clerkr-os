"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { SquareKanban } from "lucide-react";

import { sendTicketToBoard } from "@/app/tickets/actions";
import { ColumnIcon } from "@/components/kanban/ColumnIcon";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface BoardChoice {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  columns: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
    isDone: boolean;
    isDefault: boolean;
  }[];
}

export interface TicketCardLink {
  id: string;
  number: number;
  columnName: string;
  columnColor: string;
  columnIcon: string | null;
  boardName: string;
  boardSlug: string;
  done: boolean;
}

/**
 * "Add to board" — the queue says what was raised, the board says what's being
 * done about it, and this is how something crosses from one to the other.
 *
 * The column is picked here rather than defaulted, because where a ticket lands
 * IS the decision being made: filing it in Backlog and starting it today are
 * different acts. The board only appears as a choice when there is more than
 * one, so the common case is two clicks.
 *
 * A ticket already on a board isn't blocked from going to another — the same
 * report can be worked on a dev board and tracked on a release board — so the
 * cards it already has are shown instead, to be opened rather than duplicated.
 */
export function SendToBoardDialog({
  ticketId,
  ticketBody,
  boards,
  existing,
}: {
  ticketId: string;
  ticketBody: string | null;
  boards: BoardChoice[];
  existing: TicketCardLink[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [boardId, setBoardId] = useState(
    () => (boards.find((b) => b.isDefault) ?? boards[0])?.id ?? "",
  );
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const [columnId, setColumnId] = useState<string | null>(null);
  const [includeBody, setIncludeBody] = useState(true);

  // Falls back to the board's own default column, so "send it" always has a
  // destination even before anything is clicked.
  const target =
    board?.columns.find((c) => c.id === columnId) ??
    board?.columns.find((c) => c.isDefault) ??
    board?.columns[0];

  function send() {
    if (!board || !target) return;
    setError(null);
    startTransition(async () => {
      try {
        const card = await sendTicketToBoard({
          ticketId,
          boardId: board.id,
          columnId: target.id,
          includeBody: Boolean(ticketBody) && includeBody,
        });
        setOpen(false);
        router.refresh();
        toast(`#${card.number} added to ${target.name}`, {
          tone: "success",
          action: {
            label: "Open board",
            onClick: () => router.push(`/kanban?board=${card.boardSlug}`),
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add it to the board");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <SquareKanban className="h-3.5 w-3.5" />
          Add to board
        </Button>

        {existing.map((card) => (
          <Link
            key={card.id}
            href={`/kanban?board=${card.boardSlug}&card=${card.id}`}
            className="pressable inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title={`On ${card.boardName}`}
          >
            <ColumnIcon name={card.columnIcon} color={card.columnColor} className="h-3 w-3" />
            <span className="font-mono">#{card.number}</span>
            <span className={cn(card.done && "text-success")}>{card.columnName}</span>
          </Link>
        ))}
      </div>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent
          open={open}
          title="Add to board"
          description="Pick where the work should land. The card takes the ticket's words but is its own record from then on."
        >
          {boards.length > 1 && (
            <div className="mb-4">
              <span className="mb-1.5 block text-[13px] font-medium">Board</span>
              <div className="flex flex-wrap gap-1">
                {boards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setBoardId(b.id);
                      setColumnId(null);
                    }}
                    className={cn(
                      "pressable rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                      b.id === board?.id
                        ? "bg-card shadow-xs ring-1 ring-hairline"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-[13px] font-medium">Column</span>
            <div className="flex flex-wrap gap-1.5">
              {board?.columns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColumnId(c.id)}
                  className={cn(
                    "pressable inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    c.id === target?.id
                      ? "bg-card shadow-xs ring-1 ring-hairline"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <ColumnIcon name={c.icon} color={c.color} className="h-3 w-3" />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {ticketBody && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 p-3">
              <input
                type="checkbox"
                checked={includeBody}
                onChange={(e) => setIncludeBody(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">Copy the description</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  The card&rsquo;s notes start as the ticket text. Editing them later doesn&rsquo;t
                  change the ticket.
                </span>
              </span>
            </label>
          )}

          {target?.isDone && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              {target.name} is a done column — the card lands there already marked complete.
            </p>
          )}

          {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={send} disabled={isPending || !target}>
              {isPending ? "Adding…" : `Add to ${target?.name ?? "board"}`}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
