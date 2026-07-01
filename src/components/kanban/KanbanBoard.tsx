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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { moveTask } from "@/app/tasks/actions";

import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import type { KanbanStatus, KanbanTask } from "./types";

interface Props {
  statuses: KanbanStatus[];
  tasks: KanbanTask[];
  sprintId: string | null;
}

interface MoveAction {
  taskId: string;
  newStatusId: string;
  newOrder: number;
}

export function KanbanBoard({ statuses, tasks: initialTasks, sprintId }: Props) {
  const [tasks, addOptimistic] = useOptimistic<KanbanTask[], MoveAction>(
    initialTasks,
    (state, action) =>
      state.map((t) =>
        t.id === action.taskId
          ? { ...t, statusId: action.newStatusId, order: action.newOrder }
          : t,
      ),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const tasksByStatus = new Map<string, KanbanTask[]>();
  for (const s of statuses) tasksByStatus.set(s.id, []);
  for (const t of tasks) {
    if (!tasksByStatus.has(t.statusId)) tasksByStatus.set(t.statusId, []);
    tasksByStatus.get(t.statusId)!.push(t);
  }
  for (const list of tasksByStatus.values()) list.sort((a, b) => a.order - b.order);

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  function findContainer(id: string): string | null {
    if (id.startsWith("col-")) return id.slice(4);
    const task = tasks.find((t) => t.id === id);
    return task?.statusId ?? null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(_e: DragOverEvent) {
    // dnd-kit handles cross-column visual hover via the SortableContexts;
    // we commit on dragEnd below.
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activeContainer = findContainer(String(e.active.id));
    const overContainer = e.over ? findContainer(String(e.over.id)) : null;
    if (!activeContainer || !overContainer) return;

    const draggedId = String(e.active.id);
    const overId = String(e.over!.id);

    const sourceList = tasksByStatus.get(activeContainer) ?? [];
    const destList = tasksByStatus.get(overContainer) ?? [];

    const overIndex = overId.startsWith("col-")
      ? destList.length
      : destList.findIndex((t) => t.id === overId);

    // Compute new order as midpoint of the slot we're dropping into.
    const insertAt = overIndex === -1 ? destList.length : overIndex;
    const others = destList.filter((t) => t.id !== draggedId);
    const before = others[insertAt - 1]?.order;
    const after = others[insertAt]?.order;
    let newOrder: number;
    if (before === undefined && after === undefined) newOrder = 1000;
    else if (before === undefined) newOrder = after! - 1000;
    else if (after === undefined) newOrder = before + 1000;
    else newOrder = Math.round((before + after) / 2);

    startTransition(() => {
      addOptimistic({ taskId: draggedId, newStatusId: overContainer, newOrder });
      void moveTask({
        id: draggedId,
        statusId: overContainer,
        sprintId,
        order: newOrder,
      });
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((s) => (
          <KanbanColumn
            key={s.id}
            status={s}
            tasks={tasksByStatus.get(s.id) ?? []}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
