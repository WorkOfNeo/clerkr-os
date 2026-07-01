"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Clock } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";

import type { KanbanTask } from "./types";

interface Props {
  task: KanbanTask;
  isDragging?: boolean;
}

const PRIORITY_DOT: Record<KanbanTask["priority"], string> = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-blue-400",
  HIGH: "bg-orange-400",
  URGENT: "bg-red-500",
};

export function TaskCard({ task, isDragging }: Props) {
  const sortable = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const overdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;
  const blocked = task.blockedBy.length > 0;

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
      className={cn(
        "group rounded-md border bg-card p-2.5 text-xs shadow-sm transition",
        (sortable.isDragging || isDragging) && "opacity-50",
      )}
    >
      {/* dnd-kit's PointerSensor activates only after a 4px drag — a true
       * click on the card content still fires the Link navigation. */}
      <Link href={`/tasks/${task.slug}`} className="block">
        <div className="flex items-start gap-2">
          <span
            className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])}
            title={task.priority.toLowerCase()}
          />
          <div className="flex-1 space-y-1.5">
            <div className="line-clamp-2 text-sm font-medium leading-snug">{task.name}</div>

            <div className="flex flex-wrap items-center gap-1.5">
              {task.group && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: task.group.color }}
                >
                  {task.group.label}
                </span>
              )}
              {task.stack && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: task.stack.color }}
                >
                  {task.stack.label}
                </span>
              )}
              {blocked && (
                <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  blocked
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              {task.dueDate ? (
                <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}>
                  <Clock className="h-3 w-3" />
                  {formatShortDate(task.dueDate)}
                </span>
              ) : (
                <span />
              )}
              {task.assignees.length > 0 && (
                <div className="flex -space-x-1.5">
                  {task.assignees.slice(0, 3).map((a) => (
                    <Avatar key={a.user.id} className="h-5 w-5 border border-card">
                      <AvatarFallback>
                        {(a.user.name || a.user.email)
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {task.assignees.length > 3 && (
                    <Avatar className="h-5 w-5 border border-card">
                      <AvatarFallback>+{task.assignees.length - 3}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
