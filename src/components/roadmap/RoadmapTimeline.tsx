import { Badge } from "@/components/ui/badge";

import { ConfidenceMeter } from "./ConfidenceMeter";
import { ROADMAP_LANES, type RoadmapCardItem } from "./types";

interface Props {
  items: RoadmapCardItem[];
}

// Lightweight static horizontal-bars layout grouped by lane. Read-only — the
// lanes view is where editing/drag happens.
export function RoadmapTimeline({ items }: Props) {
  const byLane = new Map<string, RoadmapCardItem[]>();
  for (const lane of ROADMAP_LANES) byLane.set(lane.id, []);
  for (const item of items) byLane.get(item.lane)?.push(item);
  for (const list of byLane.values()) list.sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {ROADMAP_LANES.map((lane) => {
        const laneItems = byLane.get(lane.id) ?? [];
        return (
          <div key={lane.id} className="flex items-start gap-3">
            <div className="flex w-20 shrink-0 items-center gap-1.5 pt-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: lane.color }}
                aria-hidden
              />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {lane.label}
              </span>
            </div>
            <div className="flex flex-1 flex-wrap gap-2 border-l pl-3">
              {laneItems.length === 0 && (
                <span className="py-1.5 text-[11px] text-muted-foreground">
                  Nothing scheduled
                </span>
              )}
              {laneItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-[160px] flex-col gap-1 rounded-md border bg-card px-2.5 py-1.5"
                  style={{ borderLeftColor: lane.color, borderLeftWidth: 3 }}
                >
                  <span className="text-xs font-medium leading-snug">{item.title}</span>
                  <div className="flex items-center gap-1.5">
                    <ConfidenceMeter value={item.confidence} />
                    {item.themeTag && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {item.themeTag}
                      </Badge>
                    )}
                    {item.blocked && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        blocked
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
