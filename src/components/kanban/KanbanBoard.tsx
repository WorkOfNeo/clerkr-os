"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState } from "react";
import { Plus } from "lucide-react";

import {
  deleteColumn,
  moveCard,
  quickAddCard,
  reorderColumns,
  setDefaultColumn,
} from "@/app/kanban/actions";
import { BoardContextMenu } from "@/components/kanban/BoardContextMenu";
import { CardPanel } from "@/components/kanban/CardPanel";
import { ColumnEditor } from "@/components/kanban/ColumnEditor";
import { DeleteColumnDialog } from "@/components/kanban/DeleteColumnDialog";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { ColumnDragPreview, KanbanColumnView, columnSortId } from "@/components/kanban/KanbanColumnView";
import { useToast } from "@/components/ui/toast";
import { orderForSlot } from "@/lib/kanban-order";

import type { BoardCard, BoardColumn } from "./types";

interface Move {
  id: string;
  columnId: string;
  order: number;
}

export function KanbanBoard({
  boardId,
  boardName,
  isMyDefault,
  notifySubscribed,
  subscribedCardIds,
  columns: initialColumns,
  cards: initialCards,
  openCardId,
}: {
  boardId: string;
  boardName: string;
  isMyDefault: boolean;
  notifySubscribed: boolean;
  subscribedCardIds: string[];
  columns: BoardColumn[];
  cards: BoardCard[];
  /** ?card=<id> — a link can point at one card, so "where is this work?" from
   *  a ticket lands on the card itself rather than on the board generally. */
  openCardId?: string | null;
}) {
  const subscribed = new Set(subscribedCardIds);
  const router = useRouter();
  const { toast } = useToast();

  // The optimistic list is what the board renders, so a drop lands instantly
  // and the server write catches up behind it. Waiting for the round-trip is
  // exactly the latency that makes a board feel dead.
  const [cards, applyMove] = useOptimistic<BoardCard[], Move>(initialCards, (state, move) =>
    state.map((c) => (c.id === move.id ? { ...c, columnId: move.columnId, order: move.order } : c)),
  );

  // Same deal for the columns: a dragged column lands at once and the write
  // follows. The server's order replaces this the moment the action resolves.
  const [columns, applyColumnOrder] = useOptimistic<BoardColumn[], BoardColumn[]>(
    initialColumns,
    (_state, next) => next,
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardColumn | null>(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const [openCard, setOpenCard] = useState<BoardCard | null>(
    () => initialCards.find((c) => c.id === openCardId) ?? null,
  );

  // MOUSE ONLY, deliberately. A touch sensor claims the gesture on the way to
  // recognising a drag, and a phone only has so many gestures to give:
  //
  //   - a swipe has to scroll, or half the board is unreachable;
  //   - a press-and-hold has to open the context menu, because that IS the
  //     right-click on a phone — and a drag sensor would eat the hold before
  //     the menu ever fires.
  //
  // So on touch a card is moved from the long-press menu's "Move to" list,
  // which is faster than dragging across a horizontally-scrolling board
  // anyway. Dragging stays the mouse gesture it is good at.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }));

  const byColumn = new Map<string, BoardCard[]>();
  for (const column of columns) byColumn.set(column.id, []);
  for (const card of cards) byColumn.get(card.columnId)?.push(card);
  for (const list of byColumn.values()) list.sort((a, b) => a.order - b.order);

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const activeColumn = activeCard ? columns.find((c) => c.id === activeCard.columnId) : null;
  const draggedColumn = columns.find((c) => c.id === activeColumnId) ?? null;

  function persistColumnOrder(next: BoardColumn[]) {
    startTransition(async () => {
      applyColumnOrder(next);
      try {
        await reorderColumns(
          boardId,
          next.map((c) => c.id),
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not move that column.", { tone: "error" });
        router.refresh();
      }
    });
  }

  /** The column menu's Move left / Move right — the touch and keyboard path,
   *  since dragging is mouse-only on this board. */
  function nudgeColumn(columnId: string, by: -1 | 1) {
    const from = columns.findIndex((c) => c.id === columnId);
    const to = from + by;
    if (from < 0 || to < 0 || to >= columns.length) return;
    persistColumnOrder(arrayMove(columns, from, to));
  }

  function handleDragStart(e: DragStartEvent) {
    if (e.active.data.current?.type === "column") {
      setActiveColumnId(String(e.active.data.current.columnId));
    } else {
      setActiveId(String(e.active.id));
    }
  }

  function handleColumnDragEnd(e: DragEndEvent) {
    setActiveColumnId(null);
    if (!e.over || e.over.id === e.active.id) return;
    const ids = columns.map((c) => columnSortId(c.id));
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    persistColumnOrder(arrayMove(columns, from, to));
  }

  function columnOf(id: string): string | null {
    if (id.startsWith("col-")) return id.slice(4);
    return cards.find((c) => c.id === id)?.columnId ?? null;
  }

  function handleDragEnd(e: DragEndEvent) {
    if (e.active.data.current?.type === "column") return handleColumnDragEnd(e);
    setActiveId(null);
    const draggedId = String(e.active.id);
    const destId = e.over ? columnOf(String(e.over.id)) : null;
    if (!destId) return;

    const overId = String(e.over!.id);
    const dest = byColumn.get(destId) ?? [];
    const index = overId.startsWith("col-")
      ? dest.length
      : Math.max(0, dest.findIndex((c) => c.id === overId));

    const order = orderForSlot(dest, index, draggedId);
    const from = cards.find((c) => c.id === draggedId);
    if (from && from.columnId === destId && from.order === order) return;

    const destColumn = columns.find((c) => c.id === destId);

    startTransition(async () => {
      applyMove({ id: draggedId, columnId: destId, order });
      try {
        await moveCard({ id: draggedId, columnId: destId, order });
        // Landing in a terminal column is a completion — worth confirming,
        // because it's the one move that changes what the card MEANS.
        if (destColumn?.isDone && from?.columnId !== destId) {
          toast(`“${truncate(from?.title ?? "Card")}” marked done`, { tone: "success" });
        }
      } catch {
        toast("Could not move that card.", { tone: "error" });
        router.refresh();
      }
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => {
          setActiveId(null);
          setActiveColumnId(null);
        }}
        onDragEnd={handleDragEnd}
      >
        <BoardContextMenu
          boardId={boardId}
          boardName={boardName}
          isMyDefault={isMyDefault}
          notifySubscribed={notifySubscribed}
        >
        <div className="scroll-rail flex min-h-[60vh] snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-6 sm:snap-none">
          <SortableContext
            items={columns.map((c) => columnSortId(c.id))}
            strategy={horizontalListSortingStrategy}
          >
          {columns.map((column, index) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              columnDragging={activeColumnId !== null}
              onMoveLeft={index > 0 ? () => nudgeColumn(column.id, -1) : undefined}
              onMoveRight={
                index < columns.length - 1 ? () => nudgeColumn(column.id, 1) : undefined
              }
              cards={byColumn.get(column.id) ?? []}
              onQuickAdd={(columnId, title) =>
                startTransition(async () => {
                  await quickAddCard(columnId, title);
                  router.refresh();
                })
              }
              onEdit={setEditing}
              onOpenCard={setOpenCard}
              subscribed={subscribed}
              allColumns={columns}
              onSetDefault={(id) =>
                startTransition(async () => {
                  await setDefaultColumn(id);
                  toast("New cards will land here", { tone: "success" });
                })
              }
              onDelete={setDeleting}
            />
          ))}
          </SortableContext>

          <button
            onClick={() => setCreatingColumn(true)}
            className="pressable mt-7 flex h-11 w-[240px] shrink-0 items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium text-muted-foreground ring-1 ring-inset ring-hairline transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </button>
        </div>
        </BoardContextMenu>

        {/* The lifted card tilts and grows a little — it reads as picked up off
            the board rather than sliding along it. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.32,0.72,0,1)" }}>
          {draggedColumn && (
            <ColumnDragPreview
              column={draggedColumn}
              cards={byColumn.get(draggedColumn.id) ?? []}
            />
          )}
          {activeCard && (
            <motion.div
              initial={{ rotate: 0, scale: 1 }}
              animate={{ rotate: -2.5, scale: 1.03 }}
              transition={{ type: "spring", bounce: 0.25, duration: 0.35 }}
              className="w-[274px]"
            >
              <KanbanCard card={activeCard} accent={activeColumn?.color ?? "#8E8E93"} overlay />
            </motion.div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Kept in sync with the server copy so an edit made in the panel shows
          on the board without closing it. */}
      <CardPanel
        card={openCard ? (cards.find((c) => c.id === openCard.id) ?? openCard) : null}
        columns={columns}
        onClose={() => setOpenCard(null)}
      />

      <ColumnEditor
        open={creatingColumn || editing !== null}
        boardId={boardId}
        column={editing}
        onClose={() => {
          setCreatingColumn(false);
          setEditing(null);
        }}
      />

      <DeleteColumnDialog
        column={deleting}
        columns={columns}
        cardCount={deleting ? (byColumn.get(deleting.id)?.length ?? 0) : 0}
        onClose={() => setDeleting(null)}
        onConfirm={(id, moveTo) =>
          startTransition(async () => {
            try {
              await deleteColumn(id, moveTo);
              setDeleting(null);
              toast("Column deleted", { tone: "success" });
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not delete that column.", {
                tone: "error",
              });
            }
          })
        }
      />
    </>
  );
}

/**
 * A card only ever lands on a card or a column body; a column only ever lands
 * on another column. Without the split, a column dragged across the board
 * would "land" on whichever card happened to be under the pointer, and a card
 * could drop onto a column's sortable wrapper instead of into its list.
 */
const collisionDetection: CollisionDetection = (args) => {
  const draggingColumn = args.active.data.current?.type === "column";
  const droppableContainers = args.droppableContainers.filter(
    (c) => (c.data.current?.type === "column") === draggingColumn,
  );
  return draggingColumn
    ? closestCenter({ ...args, droppableContainers })
    : closestCorners({ ...args, droppableContainers });
};

function truncate(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
