"use client";

import { Reorder, useDragControls } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { deleteCategory, reorderCategories, upsertCategory } from "@/app/settings/categories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export interface EditableCategory {
  id: string;
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
  _count: { tickets: number };
}

const SWATCHES = [
  "#0071E3", "#38bdf8", "#f43f5e", "#a78bfa",
  "#f59e0b", "#10b981", "#ec4899", "#64748b",
];

export function CategoryEditor({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState(categories);
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EditableCategory | null>(null);

  // Keep local drag order in sync when the server sends a new list.
  useEffect(() => setOrder(categories), [categories]);

  function persistOrder(next: EditableCategory[]) {
    setOrder(next);
    startTransition(async () => {
      await reorderCategories(next.map((c) => c.id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Reorder.Group axis="y" values={order} onReorder={persistOrder} className="space-y-2">
        {order.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            onEdit={() => setEditing(c)}
            onDelete={() => setConfirmDelete(c)}
          />
        ))}
      </Reorder.Group>

      <button
        onClick={() => setCreating(true)}
        className="pressable flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add category
      </button>

      <CategoryDialog
        open={creating || editing !== null}
        category={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(label) => {
          toast(editing ? `“${label}” updated` : `“${label}” added`, { tone: "success" });
          router.refresh();
        }}
      />

      <Modal open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <ModalContent
          open={confirmDelete !== null}
          size="sm"
          title={`Delete “${confirmDelete?.label}”?`}
          description={
            confirmDelete && confirmDelete._count.tickets > 0
              ? `${confirmDelete._count.tickets} ticket${
                  confirmDelete._count.tickets === 1 ? "" : "s"
                } will stay, just uncategorised.`
              : "Nothing is filed under it."
          }
        >
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                startTransition(async () => {
                  if (target) {
                    await deleteCategory(target.id);
                    toast(`“${target.label}” deleted`);
                    router.refresh();
                  }
                });
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: EditableCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Drag is bound to the handle only, so clicking the row still opens the editor.
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.14)" }}
      className="surface group flex items-center gap-3 p-3"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Reorder ${category.label}`}
        className="cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-foreground/10"
          style={{ backgroundColor: category.color }}
        />
        <span className="truncate text-[14px] font-medium">{category.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground/70">{category.slug}</span>
        <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
          {category._count.tickets}
        </span>
      </button>

      <button
        onClick={onDelete}
        aria-label={`Delete ${category.label}`}
        className="pressable rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </Reorder.Item>
  );
}

function CategoryDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: EditableCategory | null;
  onClose: () => void;
  onSaved: (label: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLabel(category?.label ?? "");
    setColor(category?.color ?? SWATCHES[0]);
    setError(null);
  }, [open, category]);

  function save() {
    if (!label.trim() || isPending) return;
    setError(null);
    const fd = new FormData();
    if (category) fd.set("id", category.id);
    fd.set("label", label);
    fd.set("color", color);
    startTransition(async () => {
      try {
        await upsertCategory(fd);
        onSaved(label);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that.");
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent
        open={open}
        size="sm"
        title={category ? "Edit category" : "New category"}
        description={
          category
            ? "Renaming keeps every ticket already filed under it."
            : "It becomes available on every ticket straight away."
        }
      >
        <div className="space-y-4">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Design feedback"
            autoFocus
          />

          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Use ${s}`}
                onClick={() => setColor(s)}
                className="pressable h-7 w-7 rounded-full transition-shadow"
                style={{
                  backgroundColor: s,
                  boxShadow:
                    color.toLowerCase() === s.toLowerCase()
                      ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${s}`
                      : "inset 0 0 0 1px rgb(0 0 0 / 0.1)",
                }}
              />
            ))}
            <label className="pressable relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-inset ring-border">
              <span
                className="absolute inset-0"
                style={{
                  background:
                    "conic-gradient(#f43f5e,#f59e0b,#10b981,#0071E3,#a78bfa,#f43f5e)",
                }}
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="flex gap-2 border-t border-hairline pt-4">
            <Button onClick={save} disabled={!label.trim() || isPending}>
              {isPending ? "Saving…" : category ? "Save" : "Add"}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
