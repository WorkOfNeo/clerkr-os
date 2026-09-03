"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { createTicketAction } from "@/app/tickets/actions";
import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { TICKET_PRIORITIES, TICKET_PRIORITY_ORDER } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import type { TicketPriority } from "@prisma/client";

export interface CategoryOption {
  id: string;
  label: string;
  color: string;
}

/**
 * Raising a ticket happens in a dialog rather than by expanding the page —
 * the list stays put underneath, so you keep your place in the queue.
 * `N` opens it from anywhere on the list.
 */
export function NewTicketDialog({
  categories,
  openSignal,
}: {
  categories: CategoryOption[];
  /** Bumped by the parent (e.g. from ?new=1) to open the dialog. */
  openSignal?: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [reportedBy, setReportedBy] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // "N" for new, the way every issue tracker worth using does it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reset() {
    setTitle("");
    setBody("");
    setImages([]);
    setReportedBy("");
    setPriority("MEDIUM");
    setError(null);
  }

  function submit() {
    if (!title.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const { slug } = await createTicketAction({
          title,
          body,
          categoryId: categoryId || undefined,
          priority,
          reportedBy: reportedBy || undefined,
          attachments: images.map((i) => ({
            dataUrl: i.dataUrl,
            fileName: i.fileName,
            width: i.width || undefined,
            height: i.height || undefined,
          })),
        });
        setOpen(false);
        reset();
        toast("Ticket raised", {
          tone: "success",
          action: { label: "Open", onClick: () => router.push(`/tickets/${slug}`) },
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create that ticket.");
      }
    });
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        New ticket
        <kbd className="ml-0.5 rounded bg-primary-foreground/20 px-1 text-[10px]">N</kbd>
      </Button>

      <ModalContent
        open={open}
        size="lg"
        title="Raise a ticket"
        description="An idea, a bug, a request, a question."
      >
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Search returns nothing when the matter name has an apostrophe"
            autoFocus
            className="h-11 text-[15px]"
          />

          <ImageDropzone images={images} onChange={setImages} disabled={isPending}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="What happened, what you expected, how to reproduce it. Paste a screenshot straight in."
              className="resize-none border-0 bg-transparent shadow-none ring-0 focus:ring-0"
            />
          </ImageDropzone>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const active = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    "pressable rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors",
                    !active &&
                      "text-muted-foreground ring-border hover:text-foreground",
                  )}
                  style={
                    active
                      ? {
                          color: c.color,
                          backgroundColor: `${c.color}14`,
                          boxShadow: `inset 0 0 0 1px ${c.color}3d`,
                        }
                      : undefined
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-xs text-muted-foreground">
                Priority
              </Label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="h-9 w-full rounded-md bg-card px-2.5 text-[14px] shadow-xs ring-1 ring-inset ring-input"
              >
                {TICKET_PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITIES[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reportedBy" className="text-xs text-muted-foreground">
                Raised by
              </Label>
              <Input
                id="reportedBy"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                placeholder="Someone other than you"
              />
            </div>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="flex items-center gap-2 border-t border-hairline pt-4">
            <Button onClick={submit} disabled={!title.trim() || isPending}>
              {isPending ? "Raising…" : "Raise ticket"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
