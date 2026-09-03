"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { createColumn, updateColumn } from "@/app/kanban/actions";
import { COLUMN_ICONS, COLUMN_ICON_NAMES, ColumnIcon } from "@/components/kanban/ColumnIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import type { BoardColumn } from "./types";

// A spread rather than a rainbow: enough to tell columns apart at a glance,
// few enough that a board never looks like a paint chart.
const SWATCHES = [
  "#8E8E93", "#0A84FF", "#30D158", "#FF9F0A",
  "#FF375F", "#BF5AF2", "#5E5CE6", "#64D2FF",
];

export function ColumnEditor({
  open,
  column,
  onClose,
}: {
  open: boolean;
  column: BoardColumn | null;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent
        open={open}
        size="sm"
        title={column ? "Edit column" : "New column"}
        description={
          column
            ? "Rename it, recolour it, or change what landing here means."
            : "Columns are yours to invent — name it after the step you actually run."
        }
      >
        {/* Keyed so the fields reflect whichever column was opened. */}
        {open && <Form key={column?.id ?? "new"} column={column} onClose={onClose} />}
      </ModalContent>
    </DialogPrimitive.Root>
  );
}

function Form({ column, onClose }: { column: BoardColumn | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(column?.name ?? "");
  const [color, setColor] = useState(column?.color ?? SWATCHES[1]);
  const [icon, setIcon] = useState(column?.icon ?? "Circle");
  const [isDone, setIsDone] = useState(column?.isDone ?? false);
  const [wipLimit, setWipLimit] = useState(column?.wipLimit?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Give the column a name.");
      return;
    }
    const limit = wipLimit.trim() ? Number(wipLimit) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setError("A WIP limit has to be a whole number above zero.");
      return;
    }

    startTransition(async () => {
      try {
        const payload = { name: clean, color, icon, isDone, wipLimit: limit };
        if (column) await updateColumn({ id: column.id, ...payload });
        else await createColumn(payload);
        toast(column ? "Column updated" : `“${clean}” added`, { tone: "success" });
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that column.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="col-name" className="mb-1.5 block text-[13px] font-medium">
          Name
        </label>
        <Input
          id="col-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Waiting on client"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Colour</span>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setColor(s)}
              aria-label={`Colour ${s}`}
              aria-pressed={color === s}
              className={cn(
                "pressable flex h-7 w-7 items-center justify-center rounded-full transition-transform",
                color === s && "ring-2 ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: s, ...(color === s ? { boxShadow: `0 0 0 2px ${s}` } : {}) }}
            >
              {color === s && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Icon</span>
        <div className="flex flex-wrap gap-1">
          {COLUMN_ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIcon(n)}
              aria-label={n}
              aria-pressed={icon === n}
              className={cn(
                "pressable flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                icon === n ? "bg-muted ring-1 ring-inset ring-hairline" : "hover:bg-muted/60",
              )}
            >
              <ColumnIcon name={n} color={icon === n ? color : "currentColor"} />
            </button>
          ))}
        </div>
      </div>

      {/* The whole point of the rewrite: which column means "finished" is the
          user's call, and any number of columns can be terminal. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 p-3">
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => setIsDone(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--success))]"
        />
        <span>
          <span className="block text-[13px] font-medium">Work here counts as done</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
            Cards landing in this column get stamped complete. More than one column can be
            terminal — “Shipped” and “Won’t do” both are.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="col-wip" className="mb-1.5 block text-[13px] font-medium">
          WIP limit <span className="font-normal text-muted-foreground">— optional</span>
        </label>
        <Input
          id="col-wip"
          value={wipLimit}
          onChange={(e) => setWipLimit(e.target.value)}
          inputMode="numeric"
          placeholder="No limit"
        />
        <p className="mt-1 text-[12px] text-muted-foreground">
          The count turns amber past this. Nothing is blocked — it’s a nudge, not a gate.
        </p>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : column ? "Save changes" : "Add column"}
        </Button>
      </div>
    </form>
  );
}
