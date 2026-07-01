"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { addBlocker, removeBlocker } from "@/app/tasks/actions";
import { Button } from "@/components/ui/button";

interface BlockerLite {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  taskId: string;
  blockers: BlockerLite[];
  candidates: BlockerLite[];
}

export function BlockerPicker({ taskId, blockers, candidates }: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const remaining = candidates.filter((c) => !blockers.some((b) => b.id === c.id));

  return (
    <div className="rounded-md border bg-card p-2 space-y-1.5 text-xs">
      {blockers.length === 0 && (
        <p className="text-muted-foreground">Nothing blocking this task.</p>
      )}
      {blockers.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-2">
          <Link href={`/tasks/${b.slug}`} className="hover:underline">
            {b.name}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await removeBlocker(taskId, b.id);
              })
            }
            aria-label="Remove blocker"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Add blocker
        </button>
      )}

      {open && (
        <div className="space-y-1">
          {remaining.length === 0 && (
            <p className="text-muted-foreground">No other tasks to choose from.</p>
          )}
          {remaining.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await addBlocker(taskId, c.id);
                  setOpen(false);
                })
              }
              className="block w-full rounded-sm px-2 py-1 text-left hover:bg-accent"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
