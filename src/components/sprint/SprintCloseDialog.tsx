"use client";

import { useState, useTransition } from "react";

import { closeSprint } from "@/app/sprints/actions";
import { createWikiNote } from "@/app/wiki/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  sprintId: string;
  sprintSlug: string;
  sprintName: string;
}

export function SprintCloseDialog({ sprintId, sprintSlug, sprintName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [retroNotes, setRetroNotes] = useState("");
  const [saveAsNote, setSaveAsNote] = useState(true);
  const [noteTitle, setNoteTitle] = useState(`${sprintName} retro`);

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.set("id", sprintId);
      fd.set("retroNotes", retroNotes);
      await closeSprint(fd);
      if (saveAsNote && retroNotes.trim().length > 0) {
        await createWikiNote({
          title: noteTitle.trim() || `${sprintName} retro`,
          body: retroNotes,
          tags: [`sprint-${sprintSlug}`, "retro"],
        });
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Close sprint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {sprintName}</DialogTitle>
          <DialogDescription>
            Anything to capture as a decision, learning, or unresolved question? Save it as a
            wiki note tagged with this sprint so the next planning round sees it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={retroNotes}
            onChange={(e) => setRetroNotes(e.target.value)}
            placeholder="What worked, what didn't, what to change next sprint…"
            rows={6}
          />

          {retroNotes.trim().length > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={saveAsNote}
                onChange={(e) => setSaveAsNote(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <div>Also save as a wiki note</div>
                {saveAsNote && (
                  <Input
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title"
                    className="h-8"
                  />
                )}
              </div>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Closing…" : "Close sprint"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
