"use client";

import { useState, useOptimistic, startTransition } from "react";
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

import { moveRoadmapItem } from "@/app/roadmap/actions";

import { RoadmapColumn } from "./RoadmapColumn";
import { RoadmapCard } from "./RoadmapCard";
import { ROADMAP_LANES, type RoadmapCardItem, type RoadmapLane } from "./types";

interface Props {
  items: RoadmapCardItem[];
}

interface MoveAction {
  id: string;
  lane: RoadmapLane;
  order: number;
}

export function RoadmapBoard({ items: initialItems }: Props) {
  const [items, addOptimistic] = useOptimistic<RoadmapCardItem[], MoveAction>(
    initialItems,
    (state, action) =>
      state.map((i) =>
        i.id === action.id ? { ...i, lane: action.lane, order: action.order } : i,
      ),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const itemsByLane = new Map<RoadmapLane, RoadmapCardItem[]>();
  for (const lane of ROADMAP_LANES) itemsByLane.set(lane.id, []);
  for (const item of items) {
    if (!itemsByLane.has(item.lane)) itemsByLane.set(item.lane, []);
    itemsByLane.get(item.lane)!.push(item);
  }
  for (const list of itemsByLane.values()) list.sort((a, b) => a.order - b.order);

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  function findContainer(id: string): RoadmapLane | null {
    if (id.startsWith("col-")) return id.slice(4) as RoadmapLane;
    const item = items.find((i) => i.id === id);
    return item?.lane ?? null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activeContainer = findContainer(String(e.active.id));
    const overContainer = e.over ? findContainer(String(e.over.id)) : null;
    if (!activeContainer || !overContainer) return;

    const draggedId = String(e.active.id);
    const overId = String(e.over!.id);

    const destList = itemsByLane.get(overContainer) ?? [];

    const overIndex = overId.startsWith("col-")
      ? destList.length
      : destList.findIndex((i) => i.id === overId);

    // Compute new order as the midpoint of the slot we're dropping into.
    const insertAt = overIndex === -1 ? destList.length : overIndex;
    const others = destList.filter((i) => i.id !== draggedId);
    const before = others[insertAt - 1]?.order;
    const after = others[insertAt]?.order;
    let newOrder: number;
    if (before === undefined && after === undefined) newOrder = 1000;
    else if (before === undefined) newOrder = after! - 1000;
    else if (after === undefined) newOrder = before + 1000;
    else newOrder = Math.round((before + after) / 2);

    startTransition(() => {
      addOptimistic({ id: draggedId, lane: overContainer, order: newOrder });
      void moveRoadmapItem({ id: draggedId, lane: overContainer, order: newOrder });
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {ROADMAP_LANES.map((lane) => (
          <RoadmapColumn
            key={lane.id}
            lane={lane}
            items={itemsByLane.get(lane.id) ?? []}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay>{activeItem ? <RoadmapCard item={activeItem} /> : null}</DragOverlay>
    </DndContext>
  );
}
