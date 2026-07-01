"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createRoadmapItem } from "@/app/roadmap/actions";
import type { RoadmapFeature, RoadmapLane } from "./types";

interface Props {
  features: RoadmapFeature[];
  defaultLane?: RoadmapLane;
}

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function AddRoadmapItem({ features, defaultLane = "LATER" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startSubmit] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSubmit(async () => {
      await createRoadmapItem(formData);
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New roadmap item</DialogTitle>
          <DialogDescription>Add a card to a lane. It lands at the end.</DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rm-title">Title</Label>
            <Input id="rm-title" name="title" required placeholder="What's the bet?" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rm-description">Description</Label>
            <Textarea
              id="rm-description"
              name="description"
              rows={3}
              placeholder="Optional context"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rm-lane">Lane</Label>
              <select
                id="rm-lane"
                name="lane"
                defaultValue={defaultLane}
                className={SELECT_CLASS}
              >
                <option value="NOW">Now</option>
                <option value="NEXT">Next</option>
                <option value="LATER">Later</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-confidence">Confidence (0-5)</Label>
              <Input
                id="rm-confidence"
                name="confidence"
                type="number"
                min={0}
                max={5}
                defaultValue={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rm-theme">Theme tag</Label>
              <Input id="rm-theme" name="themeTag" placeholder="e.g. growth" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-feature">Linked feature</Label>
              <select id="rm-feature" name="featureId" defaultValue="" className={SELECT_CLASS}>
                <option value="">— none —</option>
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
