"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { assignFeatureToCluster } from "@/app/features/actions";
import { cn } from "@/lib/utils";

interface ClusterOption {
  id: string;
  name: string;
}

interface ClusterAssignControlProps {
  featureId: string;
  clusterId: string | null;
  clusters: ClusterOption[];
  className?: string;
}

export function ClusterAssignControl({
  featureId,
  clusterId,
  clusters,
  className,
}: ClusterAssignControlProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onChange(value: string) {
    const next = value === "" ? null : value;
    if (next === clusterId) return;
    start(async () => {
      await assignFeatureToCluster({ featureId, clusterId: next });
      router.refresh();
    });
  }

  return (
    <select
      aria-label="Assign cluster"
      value={clusterId ?? ""}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50",
        className,
      )}
    >
      <option value="">Unclustered</option>
      {clusters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
