"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { assignTask, unassignTask } from "@/app/tasks/actions";
import { Button } from "@/components/ui/button";

interface UserRow {
  id: string;
  email: string;
  name: string;
}

type Props =
  | { taskId: string; mode: "add"; users: UserRow[] }
  | { taskId: string; mode: "remove"; email: string };

export function AssigneePicker(props: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  if (props.mode === "remove") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await unassignTask(props.taskId, props.email);
          })
        }
        aria-label={`Remove ${props.email}`}
      >
        <X className="h-3 w-3" />
      </Button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add assignee
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {props.users.length === 0 && (
        <span className="text-xs text-muted-foreground">Everyone already assigned.</span>
      )}
      {props.users.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await assignTask(props.taskId, u.email);
              setOpen(false);
            })
          }
          className="rounded-full border bg-card px-2 py-0.5 text-[11px] hover:bg-accent"
        >
          {u.email.split("@")[0]}
        </button>
      ))}
    </div>
  );
}
