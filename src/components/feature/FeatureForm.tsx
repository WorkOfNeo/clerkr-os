"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createFeature, updateFeature } from "@/app/features/actions";
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
import { FEATURE_STATUSES, statusLabel, type FeatureStatus } from "./status";

interface ClusterOption {
  id: string;
  name: string;
}

interface FeatureFormProps {
  clusters: ClusterOption[];
  defaultClusterId?: string | null;
  // When provided the form edits an existing feature.
  feature?: {
    id: string;
    title: string;
    description: string | null;
    status: FeatureStatus;
    tags: string[];
    clusterId: string | null;
  };
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm";
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function FeatureForm({
  clusters,
  defaultClusterId,
  feature,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
}: FeatureFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(feature);
  const label = triggerLabel ?? (isEdit ? "Edit" : "Add feature");

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        if (isEdit && feature) {
          formData.set("id", feature.id);
          await updateFeature(formData);
        } else {
          await createFeature(formData);
        }
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
        <Button variant={triggerVariant} size={triggerSize}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit feature" : "New feature"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this entry in the feature library."
              : "Add a feature idea to the library."}
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ff-title">Title</Label>
            <Input
              id="ff-title"
              name="title"
              required
              defaultValue={feature?.title ?? ""}
              placeholder="e.g. Bulk export to CSV"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ff-description">Description</Label>
            <Textarea
              id="ff-description"
              name="description"
              rows={4}
              defaultValue={feature?.description ?? ""}
              placeholder="What is it and why does it matter?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ff-status">Status</Label>
              <select
                id="ff-status"
                name="status"
                defaultValue={feature?.status ?? "IDEA"}
                className={selectClass}
              >
                {FEATURE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ff-cluster">Cluster</Label>
              <select
                id="ff-cluster"
                name="clusterId"
                defaultValue={feature?.clusterId ?? defaultClusterId ?? ""}
                className={selectClass}
              >
                <option value="">Unclustered</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ff-tags">Tags</Label>
            <Input
              id="ff-tags"
              name="tags"
              defaultValue={feature?.tags.join(", ") ?? ""}
              placeholder="comma, separated, tags"
            />
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create feature"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
