import type { LogKind } from "@prisma/client";

import { LOG_KINDS } from "@/lib/log-kinds";
import { cn } from "@/lib/utils";

export function KindBadge({ kind, className }: { kind: LogKind; className?: string }) {
  const meta = LOG_KINDS[kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      <span aria-hidden>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}
