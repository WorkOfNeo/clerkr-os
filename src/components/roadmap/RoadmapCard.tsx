"use client";

import { useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Link2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { deleteRoadmapItem } from "@/app/roadmap/actions";
import { ConfidenceMeter } from "./ConfidenceMeter";
import type { RoadmapCardItem } from "./types";

interface Props {
  item: RoadmapCardItem;
  isDragging?: boolean;
}

export function RoadmapCard({ item, isDragging }: Props) {
  const sortable = useSortable({ id: item.id });
  const [pending, startDelete] = useTransition();

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${item.title}"?`)) return;
    startDelete(() => {
      void deleteRoadmapItem(item.id);
    });
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "group rounded-md border bg-card p-2.5 text-xs shadow-sm transition",
        (sortable.isDragging || isDragging) && "opacity-50",
        pending && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        {/* drag handle covers the body; PointerSensor needs a 4px move */}
        <div
          {...sortable.attributes}
          {...sortable.listeners}
          className="flex-1 cursor-grab space-y-1.5 active:cursor-grabbing"
        >
          <div className="line-clamp-2 text-sm font-medium leading-snug">
            {item.title}
          </div>

          {item.description && (
            <p className="line-clamp-2 text-[11px] text-muted-foreground">
              {item.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {item.themeTag && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {item.themeTag}
              </Badge>
            )}
            {item.blocked && (
              <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                blocked
              </Badge>
            )}
          </div>

          {item.blocked && item.blockerNote && (
            <p className="text-[10px] italic text-destructive">{item.blockerNote}</p>
          )}

          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <ConfidenceMeter value={item.confidence} />
            {item.feature && (
              <span
                className="inline-flex items-center gap-1 truncate text-[10px]"
                title={item.feature.title}
              >
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.feature.title}</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Delete item"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
