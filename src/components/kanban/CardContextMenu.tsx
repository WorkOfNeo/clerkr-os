"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bell, BellOff, CheckCircle2, Copy, Flag, Trash2 } from "lucide-react";

import { deleteCard, setCardSubscription, updateCard, moveCard } from "@/app/kanban/actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import { ColumnIcon } from "@/components/kanban/ColumnIcon";

import type { BoardCard, BoardColumn } from "./types";

/**
 * Right-click a card.
 *
 * Left-click opens it; this is everything else — move, follow, block, delete —
 * without a row of icons on every card. On touch there is no right-click, so
 * each of these is also reachable from the card panel; this is the shortcut,
 * not the only way.
 */
export function CardContextMenu({
  card,
  columns,
  subscribed,
  children,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  subscribed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>, message?: string) =>
    startTransition(async () => {
      await fn();
      if (message) toast(message, { tone: "success" });
      router.refresh();
    });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>#{card.number}</ContextMenuLabel>

        <ContextMenuItem
          disabled={isPending}
          onSelect={() =>
            run(
              () => setCardSubscription(card.id, !subscribed),
              subscribed ? "Stopped following" : "Following — you'll hear when it moves",
            )
          }
        >
          {subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {subscribed ? "Stop following" : "Follow this card"}
        </ContextMenuItem>

        <ContextMenuItem
          disabled={isPending}
          onSelect={() =>
            run(
              () => updateCard({ id: card.id, blocked: !card.blocked }),
              card.blocked ? "Unblocked" : "Marked blocked",
            )
          }
        >
          <Flag className="h-3.5 w-3.5" />
          {card.blocked ? "Not blocked any more" : "Mark blocked"}
        </ContextMenuItem>

        <ContextMenuItem
          disabled={isPending}
          onSelect={() => {
            void navigator.clipboard
              ?.writeText(card.title)
              .then(() => toast("Title copied"))
              .catch(() => toast("Couldn't copy", { tone: "error" }));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy title
        </ContextMenuItem>

        <ContextMenuSeparator />
        <ContextMenuLabel>Move to</ContextMenuLabel>
        {columns.map((c) => (
          <ContextMenuItem
            key={c.id}
            disabled={c.id === card.columnId || isPending}
            onSelect={() =>
              run(() => moveCard({ id: card.id, columnId: c.id, order: Date.now() }))
            }
          >
            <ColumnIcon name={c.icon} color={c.color} className="h-3.5 w-3.5" />
            {c.name}
            {c.isDone && <CheckCircle2 className="ml-auto h-3 w-3 text-success" />}
          </ContextMenuItem>
        ))}

        <ContextMenuSeparator />
        <ContextMenuItem
          destructive
          disabled={isPending}
          onSelect={() => run(() => deleteCard(card.id), "Card deleted")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete card
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
