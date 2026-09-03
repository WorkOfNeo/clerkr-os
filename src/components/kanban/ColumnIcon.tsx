"use client";

import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  CircleSlash,
  Clock,
  Flag,
  Inbox,
  Pause,
  Rocket,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// A small, closed set. A free-text icon field would mean shipping every Lucide
// icon to the client and rendering whatever string happened to be in the row —
// a picker of twelve is more useful than a thousand and stays type-safe.
export const COLUMN_ICONS: Record<string, LucideIcon> = {
  Circle,
  CircleDot,
  CircleDashed,
  CircleDotDashed,
  CheckCircle2,
  CircleSlash,
  Clock,
  Pause,
  Flag,
  Inbox,
  Rocket,
  Sparkles,
};

export const COLUMN_ICON_NAMES = Object.keys(COLUMN_ICONS);

export function ColumnIcon({
  name,
  color,
  className = "h-3.5 w-3.5",
}: {
  name: string | null;
  color: string;
  className?: string;
}) {
  const Icon = (name && COLUMN_ICONS[name]) || Circle;
  return <Icon className={className} style={{ color }} strokeWidth={2} aria-hidden />;
}
