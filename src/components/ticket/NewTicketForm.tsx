"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTicketAction } from "@/app/tickets/actions";
import { ImageDropzone, type PendingImage } from "@/components/ticket/ImageDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_PRIORITIES, TICKET_PRIORITY_ORDER } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import type { TicketPriority } from "@prisma/client";

export interface CategoryOption {
  id: string;
  label: string;
  color: string;
}

export function NewTicketForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [reportedBy, setReportedBy] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        New ticket
      </Button>
    );
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
        router.push(`/tickets/${slug}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create that ticket.");
      }
    });
  }

  return (
    <div className="w-full space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <Label htmlFor="title">What&apos;s the ticket?</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Search returns no results when the matter name has an apostrophe"
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="body">Detail</Label>
        <ImageDropzone images={images} onChange={setImages} disabled={isPending}>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="What happened, what you expected, how to reproduce it. Paste a screenshot straight in."
            className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </ImageDropzone>
      </div>

      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              categoryId !== c.id && "border-border text-muted-foreground hover:text-foreground",
            )}
            style={
              categoryId === c.id
                ? {
                    borderColor: `${c.color}66`,
                    backgroundColor: `${c.color}1a`,
                    color: c.color,
                  }
                : undefined
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="priority" className="text-xs">
            Priority
          </Label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {TICKET_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITIES[p].label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="reportedBy" className="text-xs">
            Raised by (optional)
          </Label>
          <Input
            id="reportedBy"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder="Who it actually came from"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={!title.trim() || isPending}>
          {isPending ? "Creating…" : "Create ticket"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
