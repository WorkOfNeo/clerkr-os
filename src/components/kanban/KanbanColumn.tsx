"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";

import { TaskCard } from "./TaskCard";
import type { KanbanStatus, KanbanTask } from "./types";

interface Props {
  status: KanbanStatus;
  tasks: KanbanTask[];
  activeId: string | null;
}

export function KanbanColumn({ status, tasks, activeId }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status.id}`, data: { statusId: status.id } });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-md border bg-muted/30 p-2",
        isOver && "ring-2 ring-foreground/20",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: status.color }}
            aria-hidden
          />
          <h3 className="text-xs font-semibold uppercase tracking-wide">{status.label}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{tasks.length}</span>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 min-h-[40px]">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} isDragging={t.id === activeId} />
          ))}
          {tasks.length === 0 && (
            <div className="rounded-md border border-dashed py-6 text-center text-[10px] text-muted-foreground">
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
