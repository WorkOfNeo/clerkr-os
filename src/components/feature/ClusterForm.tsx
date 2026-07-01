"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCluster } from "@/app/features/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ClusterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await createCluster(formData);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          New cluster
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New cluster</DialogTitle>
          <DialogDescription>
            Group related features under a labeled hub.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div className="space-y-1">
              <Label htmlFor="cf-icon">Icon</Label>
              <Input id="cf-icon" name="icon" placeholder="🧩" maxLength={4} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-name">Name</Label>
              <Input id="cf-name" name="name" required placeholder="e.g. Reporting" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-description">Description</Label>
            <Textarea
              id="cf-description"
              name="description"
              rows={3}
              placeholder="What ties these features together?"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-color">Color (hex or token)</Label>
            <Input id="cf-color" name="color" placeholder="#6366f1" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Create cluster"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
