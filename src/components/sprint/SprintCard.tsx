import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatRange } from "@/lib/format";

interface Props {
  sprint: {
    id: string;
    name: string;
    slug: string;
    state: "PLANNED" | "ACTIVE" | "CLOSED";
    startDate: Date;
    endDate: Date;
    goal: string | null;
    _count: { tasks: number };
  };
  active?: boolean;
}

const STATE_VARIANT: Record<Props["sprint"]["state"], "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  PLANNED: "secondary",
  CLOSED: "outline",
};

export function SprintCard({ sprint, active }: Props) {
  return (
    <Link
      href={`/sprints/${sprint.slug}`}
      className={`block rounded-lg border bg-card p-4 transition hover:border-foreground/30 ${
        active ? "border-foreground/30 ring-1 ring-foreground/10" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{sprint.name}</h3>
            <Badge variant={STATE_VARIANT[sprint.state]}>{sprint.state.toLowerCase()}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatRange(sprint.startDate, sprint.endDate)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {sprint._count.tasks} task{sprint._count.tasks === 1 ? "" : "s"}
        </div>
      </div>
      {sprint.goal && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{sprint.goal}</p>}
    </Link>
  );
}
