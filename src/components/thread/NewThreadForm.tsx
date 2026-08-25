"use client";

import { useState } from "react";

import { createThreadAction } from "@/app/threads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewThreadForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        New thread
      </Button>
    );
  }

  return (
    <form action={createThreadAction} className="w-full space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <Label htmlFor="title">What are you doing?</Label>
        <Input id="title" name="title" required placeholder="Case management in Clerkr" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="decision">The call</Label>
        <Textarea
          id="decision"
          name="decision"
          rows={2}
          placeholder="Clerkr becomes a case-management system too, toggleable per user."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="why">Why</Label>
        <Textarea id="why" name="why" rows={2} placeholder="What made this the right call." />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cluster">Product area (optional)</Label>
        <Input id="cluster" name="cluster" placeholder="Case Management" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Start it
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
