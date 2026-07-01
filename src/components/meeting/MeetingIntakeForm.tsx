"use client";

import { useEffect, useState, useTransition } from "react";

import { createMeeting } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function MeetingIntakeForm() {
  const [isPending, startTransition] = useTransition();
  // Start empty so SSR and first client render match; fill on mount to avoid a
  // midnight-boundary hydration mismatch (see the date rule in CLAUDE.md).
  const [date, setDate] = useState("");
  useEffect(() => {
    if (!date) setDate(new Date().toISOString().slice(0, 10));
  }, [date]);

  function handle(formData: FormData) {
    startTransition(async () => {
      await createMeeting(formData);
    });
  }

  return (
    <form action={handle} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required placeholder="e.g. Mikenta Law — discovery call" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Type</Label>
          <select
            id="kind"
            name="kind"
            defaultValue="CUSTOMER"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="INTERNAL">Internal</option>
            <option value="CUSTOMER">Customer</option>
            <option value="PROSPECT">Prospect</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meetingDate">Date</Label>
          <Input
            id="meetingDate"
            name="meetingDate"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="attendees">
          Attendees <span className="text-muted-foreground">(comma-separated)</span>
        </Label>
        <Input id="attendees" name="attendees" placeholder="Niels, A. Mikkelsen, 2 partners" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transcript">Transcript / summary</Label>
        <Textarea
          id="transcript"
          name="transcript"
          required
          rows={12}
          placeholder="Paste the meeting transcript or your rough notes here…"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save meeting"}
        </Button>
      </div>
    </form>
  );
}
