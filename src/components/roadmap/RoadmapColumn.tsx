"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";

import { RoadmapCard } from "./RoadmapCard";
import type { RoadmapCardItem, RoadmapLane } from "./types";

interface Props {
  lane: { id: RoadmapLane; label: string; color: string };
  items: RoadmapCardItem[];
  activeId: string | null;
}

export function RoadmapColumn({ lane, items, activeId }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${lane.id}`,
    data: { lane: lane.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-80 shrink-0 flex-col gap-2 rounded-md border bg-muted/30 p-2",
        isOver && "ring-2 ring-foreground/20",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: lane.color }}
            aria-hidden
          />
          <h3 className="text-xs font-semibold uppercase tracking-wide">{lane.label}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>

      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-[60px] flex-1 flex-col gap-2">
          {items.map((item) => (
            <RoadmapCard key={item.id} item={item} isDragging={item.id === activeId} />
          ))}
          {items.length === 0 && (
            <div className="rounded-md border border-dashed py-8 text-center text-[10px] text-muted-foreground">
              Nothing here yet — drop items or add one
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
