"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Star, StarOff } from "lucide-react";

import { setMyDefaultBoard, setNotifySubscribedCards } from "@/app/kanban/actions";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuHint,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";

/**
 * Right-click anywhere on the board background: the settings for how THIS VIEW
 * behaves for you. Preferences rather than data — which board you land on, and
 * whether cards you follow are allowed to interrupt you.
 */
export function BoardContextMenu({
  boardId,
  boardName,
  isMyDefault,
  notifySubscribed,
  children,
}: {
  boardId: string;
  boardName: string;
  isMyDefault: boolean;
  notifySubscribed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [notify, setNotify] = useState(notifySubscribed);
  const [isPending, startTransition] = useTransition();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[16rem]">
        <ContextMenuLabel>{boardName}</ContextMenuLabel>

        <ContextMenuItem
          disabled={isMyDefault || isPending}
          onSelect={() =>
            startTransition(async () => {
              await setMyDefaultBoard(boardId);
              toast(`Kanban opens on “${boardName}” for you`, { tone: "success" });
              router.refresh();
            })
          }
        >
          <Star className="h-3.5 w-3.5" />
          {isMyDefault ? "Opens for you by default" : "Open this one by default"}
        </ContextMenuItem>

        {isMyDefault && (
          <ContextMenuItem
            disabled={isPending}
            onSelect={() =>
              startTransition(async () => {
                await setMyDefaultBoard(null);
                toast("Following the workspace default again");
                router.refresh();
              })
            }
          >
            <StarOff className="h-3.5 w-3.5" />
            Clear my default
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />
        <ContextMenuLabel>Notifications</ContextMenuLabel>

        <ContextMenuCheckboxItem
          checked={notify}
          // Kept open so the effect is visible without re-opening the menu.
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(next) => {
            setNotify(next);
            startTransition(async () => {
              await setNotifySubscribedCards(next);
              toast(next ? "You'll hear about cards you follow" : "Muted cards you follow");
            });
          }}
        >
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Bell className="h-3.5 w-3.5" />
              Tell me about cards I follow
            </span>
            <ContextMenuHint>
              You follow every card you create. Moves reach you in the bell, and on your phone if
              notifications are on.
            </ContextMenuHint>
          </span>
        </ContextMenuCheckboxItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
