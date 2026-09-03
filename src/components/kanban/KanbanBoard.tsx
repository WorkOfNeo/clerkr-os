"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState } from "react";
import { Plus } from "lucide-react";

import {
  deleteColumn,
  moveCard,
  quickAddCard,
  setDefaultColumn,
} from "@/app/kanban/actions";
import { ColumnEditor } from "@/components/kanban/ColumnEditor";
import { DeleteColumnDialog } from "@/components/kanban/DeleteColumnDialog";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumnView } from "@/components/kanban/KanbanColumnView";
import { useToast } from "@/components/ui/toast";
import { orderForSlot } from "@/lib/kanban-order";

import type { BoardCard, BoardColumn } from "./types";

interface Move {
  id: string;
  columnId: string;
  order: number;
}

export function KanbanBoard({
  columns,
  cards: initialCards,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  // The optimistic list is what the board renders, so a drop lands instantly
  // and the server write catches up behind it. Waiting for the round-trip is
  // exactly the latency that makes a board feel dead.
  const [cards, applyMove] = useOptimistic<BoardCard[], Move>(initialCards, (state, move) =>
    state.map((c) => (c.id === move.id ? { ...c, columnId: move.columnId, order: move.order } : c)),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardColumn | null>(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);

  // 4px of slop: below that it's a click, above it it's a drag. Without the
  // threshold, opening a card by clicking becomes a coin toss.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byColumn = new Map<string, BoardCard[]>();
  for (const column of columns) byColumn.set(column.id, []);
  for (const card of cards) byColumn.get(card.columnId)?.push(card);
  for (const list of byColumn.values()) list.sort((a, b) => a.order - b.order);

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const activeColumn = activeCard ? columns.find((c) => c.id === activeCard.columnId) : null;

  function columnOf(id: string): string | null {
    if (id.startsWith("col-")) return id.slice(4);
    return cards.find((c) => c.id === id)?.columnId ?? null;
  }

  function handleDragEnd(e: DragEndEvent) {
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
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-6">
          {columns.map((column) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              cards={byColumn.get(column.id) ?? []}
              onQuickAdd={(columnId, title) =>
                startTransition(async () => {
                  await quickAddCard(columnId, title);
                  router.refresh();
                })
              }
              onEdit={setEditing}
              onOpenCard={(card) => router.push(`/kanban/${card.slug}`)}
              onSetDefault={(id) =>
                startTransition(async () => {
                  await setDefaultColumn(id);
                  toast("New cards will land here", { tone: "success" });
                })
              }
              onDelete={setDeleting}
            />
          ))}

          <button
            onClick={() => setCreatingColumn(true)}
            className="pressable mt-7 flex h-11 w-[240px] shrink-0 items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium text-muted-foreground ring-1 ring-inset ring-hairline transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </button>
        </div>

        {/* The lifted card tilts and grows a little — it reads as picked up off
            the board rather than sliding along it. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.32,0.72,0,1)" }}>
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

      <ColumnEditor
        open={creatingColumn || editing !== null}
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

function truncate(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
