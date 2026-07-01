"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteTaxonomy, upsertTaxonomy } from "@/app/settings/taxonomy/actions";

export interface TaxonomyRow {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
  isDone?: boolean;
}

interface Props {
  kind: "status" | "group" | "stack";
  title: string;
  helperText: string;
  rows: TaxonomyRow[];
}

export function TaxonomyEditor({ kind, title, helperText, rows }: Props) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
      <div className="rounded-md border divide-y">
        {rows.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No rows yet.</div>
        )}
        {rows.map((row) => (
          <Row key={row.id} kind={kind} row={row} />
        ))}
        <NewRowForm kind={kind} />
      </div>
    </section>
  );
}

function Row({ kind, row }: { kind: "status" | "group" | "stack"; row: TaxonomyRow }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(row.label);
  const [color, setColor] = useState(row.color);
  const [isDone, setIsDone] = useState(Boolean(row.isDone));

  function save() {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("label", label);
    fd.set("color", color);
    fd.set("sortOrder", String(row.sortOrder));
    if (kind === "status") fd.set("isDone", isDone ? "true" : "false");
    start(async () => {
      await upsertTaxonomy(kind, fd);
    });
  }

  function remove() {
    if (!confirm(`Delete "${row.label}"? This cannot be undone.`)) return;
    start(async () => {
      try {
        await deleteTaxonomy(kind, row.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={save}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
        aria-label="Color"
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== row.label && save()}
        className="h-8 flex-1 text-sm"
      />
      {kind === "status" && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isDone}
            onChange={(e) => {
              setIsDone(e.target.checked);
              const fd = new FormData();
              fd.set("id", row.id);
              fd.set("label", label);
              fd.set("color", color);
              fd.set("sortOrder", String(row.sortOrder));
              fd.set("isDone", e.target.checked ? "true" : "false");
              start(async () => {
                await upsertTaxonomy(kind, fd);
              });
            }}
            className="h-3.5 w-3.5"
          />
          terminal
        </label>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function NewRowForm({ kind }: { kind: "status" | "group" | "stack" }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#94a3b8");

  function add() {
    if (!label.trim()) return;
    const fd = new FormData();
    fd.set("label", label.trim());
    fd.set("color", color);
    start(async () => {
      try {
        await upsertTaxonomy(kind, fd);
        setLabel("");
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
        aria-label="Color"
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={`New ${kind}`}
        className="h-8 flex-1 text-sm"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={add}
        disabled={pending || !label.trim()}
        aria-label="Add"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
