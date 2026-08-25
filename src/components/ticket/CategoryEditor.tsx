"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCategory, upsertCategory } from "@/app/settings/categories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EditableCategory {
  id: string;
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
  _count: { tickets: number };
}

export function CategoryEditor({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#38bdf8");
  const [error, setError] = useState<string | null>(null);

  function run(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await upsertCategory(formData);
        setNewLabel("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that category.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <input
              type="color"
              defaultValue={c.color}
              disabled={isPending}
              className="h-7 w-9 cursor-pointer rounded border bg-transparent"
              onChange={(e) => {
                const fd = new FormData();
                fd.set("id", c.id);
                fd.set("label", c.label);
                fd.set("color", e.target.value);
                run(fd);
              }}
            />
            <Input
              defaultValue={c.label}
              disabled={isPending}
              className="h-8 w-48 text-sm"
              onBlur={(e) => {
                if (e.target.value.trim() === c.label) return;
                const fd = new FormData();
                fd.set("id", c.id);
                fd.set("label", e.target.value);
                fd.set("color", c.color);
                run(fd);
              }}
            />
            <span className="font-mono text-[11px] text-muted-foreground">{c.slug}</span>
            <span className="text-xs text-muted-foreground">
              {c._count.tickets} {c._count.tickets === 1 ? "ticket" : "tickets"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() =>
                startTransition(async () => {
                  await deleteCategory(c.id);
                  router.refresh();
                })
              }
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border bg-transparent"
        />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New category, e.g. Design feedback"
          className="h-8 w-64 text-sm"
        />
        <Button
          size="sm"
          disabled={!newLabel.trim() || isPending}
          onClick={() => {
            const fd = new FormData();
            fd.set("label", newLabel);
            fd.set("color", newColor);
            run(fd);
          }}
        >
          Add
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
