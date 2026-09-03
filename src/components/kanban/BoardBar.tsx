"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";

import {
  deleteBoard,
  setMyDefaultBoard,
  setWorkspaceDefaultBoard,
} from "@/app/kanban/actions";
import { BoardEditor } from "@/components/kanban/BoardEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BoardOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  columnCount: number;
}

/**
 * Board switcher. Pills rather than a dropdown because there are a handful of
 * boards, not a hundred — seeing all of them beats hiding them behind a click,
 * and the current one is then obvious without opening anything.
 */
export function BoardBar({
  boards,
  activeSlug,
  myDefaultBoardId,
}: {
  boards: BoardOption[];
  activeSlug: string;
  /** This person's own landing board, if they've chosen one. */
  myDefaultBoardId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<BoardOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const active = boards.find((b) => b.slug === activeSlug);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {boards.map((board) => {
          const isActive = board.slug === activeSlug;
          return (
            <Link
              key={board.id}
              href={`/kanban?board=${board.slug}`}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="board-pill"
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="absolute inset-0 rounded-full bg-card shadow-xs ring-1 ring-hairline"
                />
              )}
              <span className="relative z-10">{board.name}</span>
            </Link>
          );
        })}

        <Tooltip label="New board">
          <button
            onClick={() => setCreating(true)}
            className="pressable ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="New board"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Tooltip>

        {active && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="pressable flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`${active.name} board options`}
                title="Board settings — or right-click the board"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={() => setEditing(active)}>
                Rename & describe…
              </DropdownMenuItem>
              {/* Mine vs everyone's — two different promises, so two items. */}
              <DropdownMenuItem
                disabled={myDefaultBoardId === active.id}
                onSelect={() =>
                  startTransition(async () => {
                    await setMyDefaultBoard(active.id);
                    toast(`Kanban opens on “${active.name}” for you`, { tone: "success" });
                  })
                }
              >
                {myDefaultBoardId === active.id
                  ? "Opens for you by default"
                  : "Open this one by default"}
              </DropdownMenuItem>
              {myDefaultBoardId !== null && (
                <DropdownMenuItem
                  onSelect={() =>
                    startTransition(async () => {
                      await setMyDefaultBoard(null);
                      toast("Following the workspace default again");
                    })
                  }
                >
                  Clear my default
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={active.isDefault}
                onSelect={() =>
                  startTransition(async () => {
                    await setWorkspaceDefaultBoard(active.id);
                    toast(`New cards land on “${active.name}” by default`, { tone: "success" });
                  })
                }
              >
                {active.isDefault
                  ? "Workspace default"
                  : "Make workspace default"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() =>
                  startTransition(async () => {
                    try {
                      await deleteBoard(active.id);
                      toast("Board deleted", { tone: "success" });
                      router.push("/kanban");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : "Could not delete that board.", {
                        tone: "error",
                      });
                    }
                  })
                }
              >
                Delete board…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <BoardEditor
        open={creating || editing !== null}
        board={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}
