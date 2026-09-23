"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2, Plus, X } from "lucide-react";
import { startTransition, useOptimistic, useState } from "react";

import {
  addSubtasksAction,
  deleteSubtaskAction,
  moveSubtask,
  updateSubtaskAction,
} from "@/app/kanban/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import type { BoardSubtask } from "./types";

type Change =
  | { type: "add"; items: BoardSubtask[] }
  | { type: "patch"; id: string; patch: Partial<BoardSubtask> }
  | { type: "remove"; id: string }
  | { type: "move"; from: number; to: number };

function apply(list: BoardSubtask[], change: Change): BoardSubtask[] {
  switch (change.type) {
    case "add":
      return [...list, ...change.items];
    case "patch":
      return list.map((s) => (s.id === change.id ? { ...s, ...change.patch } : s));
    case "remove":
      return list.filter((s) => s.id !== change.id);
    case "move":
      return arrayMove(list, change.from, change.to);
  }
}

/**
 * One line per subtask, whatever it was pasted as: "- [ ] x", "* x", "1. x"
 * and a bare "x" all become "x". This is the "paste the plan's items in" path.
 */
export function splitSubtaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/^\s*\[[ xX]\]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * A card's checklist. The card face counts it ("3/7"), which is how a board
 * that steers projects shows how far along each one is without opening it.
 *
 * Every change lands at once and the write follows — ticking a box and
 * waiting on a round trip to see the tick is what makes a list feel broken.
 */
export function SubtaskList({
  cardId,
  subtasks: initial,
}: {
  cardId: string;
  subtasks: BoardSubtask[];
}) {
  const [subtasks, change] = useOptimistic(initial, apply);
  const [draft, setDraft] = useState("");
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Only the grip is a handle, so a touch drag can't steal the sheet's
    // scroll the way a whole-row handle would.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const done = subtasks.filter((s) => s.done).length;

  function run(optimistic: Change, write: () => Promise<void>, failure: string) {
    startTransition(async () => {
      change(optimistic);
      try {
        await write();
      } catch {
        toast(failure, { tone: "error" });
      }
    });
  }

  function add(titles: string[]) {
    if (!titles.length) return;
    const stamp = Date.now();
    run(
      {
        type: "add",
        items: titles.map((title, i) => ({
          id: `pending-${stamp}-${i}`,
          title,
          done: false,
          doneAt: null,
          order: Number.MAX_SAFE_INTEGER,
          ledgerRef: null,
        })),
      },
      () => addSubtasksAction(cardId, titles),
      "Couldn't add that subtask.",
    );
  }

  function commitDraft() {
    const titles = splitSubtaskLines(draft);
    setDraft("");
    add(titles);
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.over.id === e.active.id) return;
    const from = subtasks.findIndex((s) => s.id === e.active.id);
    const to = subtasks.findIndex((s) => s.id === e.over!.id);
    if (from < 0 || to < 0) return;
    const id = String(e.active.id);
    run({ type: "move", from, to }, () => moveSubtask(id, to), "Couldn't move that subtask.");
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3">
        <span className="text-[13px] font-medium">Subtasks</span>
        {subtasks.length > 0 && (
          <SubtaskProgress done={done} total={subtasks.length} className="max-w-[220px] flex-1" />
        )}
      </div>

      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="-mx-1.5">
              {subtasks.map((s) => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  onToggle={(next) =>
                    run(
                      { type: "patch", id: s.id, patch: { done: next } },
                      () => updateSubtaskAction({ id: s.id, done: next }),
                      "Couldn't update that subtask.",
                    )
                  }
                  onRename={(title) =>
                    run(
                      { type: "patch", id: s.id, patch: { title } },
                      () => updateSubtaskAction({ id: s.id, title }),
                      "Couldn't rename that subtask.",
                    )
                  }
                  onRemove={() =>
                    run(
                      { type: "remove", id: s.id },
                      () => deleteSubtaskAction(s.id),
                      "Couldn't delete that subtask.",
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-1 flex items-center gap-2 rounded-md px-1.5 py-1 focus-within:bg-muted/50">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Escape") {
              setDraft("");
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            // A single line pastes normally; a list becomes one subtask per line.
            if (!/\r?\n/.test(text.trim())) return;
            e.preventDefault();
            add(splitSubtaskLines(`${draft}${text}`));
            setDraft("");
          }}
          onBlur={() => draft.trim() && commitDraft()}
          placeholder={subtasks.length ? "Add a subtask" : "Add a subtask — or paste a list"}
          aria-label="Add a subtask"
          className="h-7 min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-muted-foreground/70 focus:outline-none"
        />
      </div>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onRename,
  onRemove,
}: {
  subtask: BoardSubtask;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const pending = subtask.id.startsWith("pending-");
  const sortable = useSortable({ id: subtask.id, disabled: pending });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subtask.title);

  function commit() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== subtask.title) onRename(next);
    else setTitle(subtask.title);
  }

  return (
    <li
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={cn(
        "group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50",
        sortable.isDragging && "relative z-10 bg-card shadow-md ring-1 ring-hairline",
      )}
    >
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Reorder “${subtask.title}”`}
        className="mt-1 -ml-0.5 cursor-grab touch-none text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Checkbox
        checked={subtask.done}
        disabled={pending}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={subtask.done ? `Mark “${subtask.title}” not done` : `Mark “${subtask.title}” done`}
        className="mt-[3px] rounded-[4px]"
      />

      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setTitle(subtask.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-sm bg-card px-1 text-[13.5px] leading-6 ring-1 ring-primary/60 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            // A sync may have renamed it since this row mounted.
            setTitle(subtask.title);
            setEditing(true);
          }}
          className={cn(
            "min-w-0 flex-1 cursor-text text-left text-[13.5px] leading-6",
            subtask.done && "text-muted-foreground line-through decoration-muted-foreground/50",
          )}
        >
          {subtask.title}
        </button>
      )}

      {subtask.ledgerRef && (
        <span
          className="mt-1 shrink-0 text-muted-foreground/70"
          title={`Mirrors NEO Ledger item ${subtask.ledgerRef}`}
        >
          <Link2 className="h-3.5 w-3.5" />
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        aria-label={`Delete “${subtask.title}”`}
        className="mt-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * Done-of-total as a bar and a count. Used on the card face and above the
 * list, so the number you see on the board is the number you see inside.
 */
export function SubtaskProgress({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const complete = total > 0 && done === total;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} of ${total} subtasks done`}
        className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-apple",
            complete ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[11.5px] tabular-nums",
          complete ? "font-medium text-success" : "text-muted-foreground",
        )}
      >
        {done}/{total}
      </span>
    </div>
  );
}
