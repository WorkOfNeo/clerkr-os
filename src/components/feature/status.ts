import type { BadgeProps } from "@/components/ui/badge";

export type FeatureStatus =
  | "IDEA"
  | "VALIDATED"
  | "IN_ROADMAP"
  | "SHIPPED"
  | "SMALL_UNIQUE";

export const FEATURE_STATUSES: FeatureStatus[] = [
  "IDEA",
  "VALIDATED",
  "IN_ROADMAP",
  "SHIPPED",
  "SMALL_UNIQUE",
];

export const STATUS_META: Record<
  FeatureStatus,
  { label: string; meaning: string; variant: BadgeProps["variant"] }
> = {
  IDEA: {
    label: "Idea",
    meaning: "Raw request — not yet validated.",
    variant: "secondary",
  },
  VALIDATED: {
    label: "Validated",
    meaning: "Confirmed worth building.",
    variant: "default",
  },
  IN_ROADMAP: {
    label: "In roadmap",
    meaning: "Scheduled on the roadmap.",
    variant: "default",
  },
  SHIPPED: {
    label: "Shipped",
    meaning: "Built and released.",
    variant: "outline",
  },
  SMALL_UNIQUE: {
    label: "Small / unique",
    meaning: "Niche one-off worth keeping.",
    variant: "outline",
  },
};

export function statusLabel(status: FeatureStatus): string {
  return STATUS_META[status]?.label ?? status;
}
