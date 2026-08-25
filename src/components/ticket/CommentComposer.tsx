"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { commentOnTicket } from "@/app/tickets/actions";
import { ImageDropzone, type PendingImage } from "@/components/ticket/ImageDropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUSES } from "@/lib/ticket-meta";

import type { TicketStatus } from "@prisma/client";

/**
 * Comment box. ⌘/Ctrl+↵ submits, screenshots paste straight in, and the
 * "comment and mark …" buttons collapse the common two-step (say what you did,
 * then change the status) into one.
 */
export function CommentComposer({
  ticketId,
  status,
}: {
  ticketId: string;
  status: TicketStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit(nextStatus?: TicketStatus) {
    if (!body.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await commentOnTicket({
          ticketId,
          body,
          status: nextStatus,
          attachments: images.map((i) => ({
            dataUrl: i.dataUrl,
            fileName: i.fileName,
            width: i.width || undefined,
            height: i.height || undefined,
          })),
        });
        setBody("");
        setImages([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that comment.");
      }
    });
  }

  const canResolve = !TICKET_STATUSES[status].resolved;

  return (
    <div className="space-y-2">
      <ImageDropzone images={images} onChange={setImages} disabled={isPending}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Add a comment — paste a screenshot with ⌘V / Ctrl+V"
          className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </ImageDropzone>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => submit()} disabled={!body.trim() || isPending}>
          {isPending ? "Saving…" : "Comment"}
        </Button>
        {canResolve && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!body.trim() || isPending}
              onClick={() => submit("FIXED")}
            >
              Comment &amp; mark fixed
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!body.trim() || isPending}
              onClick={() => submit("SHIPPED")}
            >
              Comment &amp; mark shipped
            </Button>
          </>
        )}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">⌘↵</span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
