"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SprintOption {
  slug: string;
  name: string;
  state: "PLANNED" | "ACTIVE" | "CLOSED";
}

interface Props {
  sprints: SprintOption[];
  currentSlug: string | null;
}

export function SprintSwitcher({ sprints, currentSlug }: Props) {
  const router = useRouter();

  function onChange(v: string) {
    if (v === "_backlog") router.push("/tasks");
    else router.push(`/tasks?sprint=${v}`);
  }

  return (
    <Select value={currentSlug ?? "_backlog"} onValueChange={onChange}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_backlog">Backlog (no sprint)</SelectItem>
        {sprints.map((s) => (
          <SelectItem key={s.slug} value={s.slug}>
            {s.name} <span className="ml-1 text-xs text-muted-foreground">({s.state.toLowerCase()})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
