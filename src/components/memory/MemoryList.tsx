"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  createMemory,
  deleteMemory,
  setMemoryStatus,
  updateMemory,
} from "@/app/memory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/format";
import { MEMORY_CATEGORIES } from "@/lib/memory/memory";
import { cn } from "@/lib/utils";

export interface MemoryItem {
  id: string;
  category: string;
  status: string;
  title: string;
  content: string;
  sourceNote: string | null;
  timesApplied: number;
  createdAt: Date | string;
  createdBy: { email: string; name: string } | null;
}

export function MemoryList({ memories }: { memories: MemoryItem[] }) {
  const [creating, setCreating] = useState(false);
  const proposed = memories.filter((m) => m.status === "PROPOSED");
  const active = memories.filter((m) => m.status === "ACTIVE");
  const dismissed = memories.filter((m) => m.status === "DISMISSED");

  return (
    <div className="space-y-8">
      {proposed.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-[15px] font-semibold">Waiting on you</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Suggested from recent conversations. Nothing here affects the assistant until you
              confirm it.
            </p>
          </div>
          {proposed.map((m) => (
            <Row key={m.id} memory={m} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">In force</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {active.length === 0
                ? "Nothing yet — write one, or let tonight's pass suggest some."
                : `${active.length} memories the assistant reads before every reply.`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-3.5 w-3.5" />
            Write one
          </Button>
        </div>

        {creating && <NewMemory onDone={() => setCreating(false)} />}
        {active.map((m) => (
          <Row key={m.id} memory={m} />
        ))}
      </section>

      {dismissed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold text-muted-foreground">Dismissed</h2>
          <p className="text-[13px] text-muted-foreground">
            Kept so the nightly pass doesn&apos;t suggest them again.
          </p>
          {dismissed.map((m) => (
            <Row key={m.id} memory={m} />
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ memory }: { memory: MemoryItem }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memory.title);
  const [content, setContent] = useState(memory.content);

  const meta = MEMORY_CATEGORIES.find((c) => c.value === memory.category);
  const proposed = memory.status === "PROPOSED";
  const dismissed = memory.status === "DISMISSED";

  const act = (fn: () => Promise<void>, message?: string) =>
    startTransition(async () => {
      await fn();
      if (message) toast(message, { tone: "success" });
      router.refresh();
    });

  return (
    <motion.div
      layout
      className={cn(
        "rounded-lg bg-card p-3.5 shadow-[0_0_0_1px_hsl(var(--hairline))]",
        proposed && "shadow-[0_0_0_1px_hsl(var(--foreground)/0.18)]",
        dismissed && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
              {meta?.label ?? memory.category}
            </span>
            {memory.timesApplied > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                used {memory.timesApplied}×
              </span>
            )}
            <span className="text-[11px] text-muted-foreground/70">
              {memory.createdBy ? "written" : "learned"} · {formatShortDate(memory.createdAt)}
            </span>
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="text-[13px]"
              />
              <div className="flex gap-2">
                <Button
                  size="xs"
                  disabled={isPending}
                  onClick={() =>
                    act(async () => {
                      await updateMemory({ id: memory.id, title, content });
                      setEditing(false);
                    }, "Saved")
                  }
                >
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] font-medium leading-snug">{memory.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {memory.content}
              </p>
              {memory.sourceNote && (
                <p className="mt-1.5 border-l-2 border-hairline pl-2 text-[12px] italic text-muted-foreground/80">
                  {memory.sourceNote}
                </p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            {proposed && (
              <>
                <Button
                  size="xs"
                  disabled={isPending}
                  onClick={() => act(() => setMemoryStatus(memory.id, "ACTIVE"), "Remembered")}
                >
                  <Check className="h-3 w-3" />
                  Keep
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => act(() => setMemoryStatus(memory.id, "DISMISSED"))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
            {!proposed && (
              <>
                <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                {!dismissed ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => act(() => setMemoryStatus(memory.id, "DISMISSED"), "Shelved")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => act(() => setMemoryStatus(memory.id, "ACTIVE"), "Back in force")}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={isPending}
                  onClick={() => act(() => deleteMemory(memory.id), "Deleted")}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function NewMemory({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState(MEMORY_CATEGORIES[0].value);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const hint = MEMORY_CATEGORIES.find((c) => c.value === category)?.hint;

  return (
    <div className="space-y-2.5 rounded-lg bg-muted/40 p-3.5">
      <div className="flex flex-wrap gap-1">
        {MEMORY_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              "pressable rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
              category === c.value
                ? "bg-card shadow-xs ring-1 ring-hairline"
                : "text-muted-foreground hover:bg-card/60",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="One line — how it shows in this list"
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="Written as an instruction: “Title bugs by the symptom, never the guessed cause.”"
        className="text-[13px]"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending || !title.trim() || !content.trim()}
          onClick={() =>
            startTransition(async () => {
              await createMemory({ category, title, content });
              toast("Remembered", { tone: "success" });
              onDone();
              router.refresh();
            })
          }
        >
          Remember this
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
