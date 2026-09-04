"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteMeeting } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";
import { ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { MeetingFootprint } from "@/lib/meetings/delete";

// One action removes the meeting and everything it put into the system. The
// footprint is computed on the server when the page renders, so the confirm
// step can say exactly what is about to go rather than "are you sure?".

export function DeleteMeetingButton({
  meetingId,
  footprint,
}: {
  meetingId: string;
  footprint: MeetingFootprint;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const parts: string[] = [];
  const brief = footprint.decisions + footprint.actionItems + footprint.openQuestions;
  if (brief) parts.push(`${brief} brief item${brief === 1 ? "" : "s"}`);
  if (footprint.pendingProposals) {
    parts.push(`${footprint.pendingProposals} unaccepted proposal${footprint.pendingProposals === 1 ? "" : "s"}`);
  }
  if (footprint.features.length) {
    parts.push(`${footprint.features.length} feature${footprint.features.length === 1 ? "" : "s"} it added to the library`);
  }
  if (footprint.tickets.length) {
    parts.push(`${footprint.tickets.length} ticket${footprint.tickets.length === 1 ? "" : "s"} raised from it`);
  }

  function run() {
    startTransition(async () => {
      try {
        await deleteMeeting(meetingId);
        // deleteMeeting redirects; nothing to do on success.
      } catch (err) {
        // A redirect surfaces as a thrown NEXT_REDIRECT — let that through.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
        toast(err instanceof Error ? err.message : "Could not delete the meeting.", {
          tone: "error",
        });
      }
    });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label="Delete meeting and everything it created"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      <ModalContent
        open={open}
        size="sm"
        title="Delete this meeting?"
        description={
          parts.length
            ? `Also removes ${parts.join(", ")}.`
            : "The transcript and TL;DR are removed. Nothing else was created from it."
        }
      >
        {(footprint.features.length > 0 || footprint.tickets.length > 0) && (
          <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto text-[12.5px] text-muted-foreground">
            {footprint.features.map((f) => (
              <li key={f.id} className="truncate">
                Feature · {f.title}
              </li>
            ))}
            {footprint.tickets.map((t) => (
              <li key={t.id} className="truncate">
                Ticket · #{t.number} {t.title}
              </li>
            ))}
          </ul>
        )}
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          Features that another meeting also points at, that have board cards, or that this meeting
          only linked to stay where they are.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={run} disabled={isPending} autoFocus>
            {isPending ? "Deleting…" : "Delete everything"}
          </Button>
        </div>
      </ModalContent>
    </DialogPrimitive.Root>
  );
}
