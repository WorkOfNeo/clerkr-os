"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setFeatureStatus } from "@/app/features/actions";
import { cn } from "@/lib/utils";
import { FEATURE_STATUSES, statusLabel, type FeatureStatus } from "./status";

interface FeatureStatusControlProps {
  featureId: string;
  status: FeatureStatus;
  className?: string;
}

export function FeatureStatusControl({
  featureId,
  status,
  className,
}: FeatureStatusControlProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onChange(next: FeatureStatus) {
    if (next === status) return;
    start(async () => {
      await setFeatureStatus({ id: featureId, status: next });
      router.refresh();
    });
  }

  return (
    <select
      aria-label="Change status"
      value={status}
      disabled={pending}
      onChange={(e) => onChange(e.target.value as FeatureStatus)}
      className={cn(
        "flex h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50",
        className,
      )}
    >
      {FEATURE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
  );
}
