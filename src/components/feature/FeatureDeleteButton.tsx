"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteFeature } from "@/app/features/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FeatureDeleteButtonProps {
  featureId: string;
  featureTitle: string;
  // When set, navigate here after deletion (used from the detail page).
  redirectTo?: string;
}

export function FeatureDeleteButton({
  featureId,
  featureTitle,
  redirectTo,
}: FeatureDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      await deleteFeature(featureId);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete feature</DialogTitle>
          <DialogDescription>
            Delete “{featureTitle}”? This removes it from the library and unlinks any
            cross-links. Promoted signals keep their record but lose the link.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
