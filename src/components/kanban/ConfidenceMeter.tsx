import { cn } from "@/lib/utils";

interface Props {
  value: number;
  className?: string;
}

// 0-5 little bars; filled bars reflect confidence level.
export function ConfidenceMeter({ value, className }: Props) {
  const filled = Math.max(0, Math.min(5, value));
  return (
    <div
      className={cn("flex items-end gap-0.5", className)}
      title={`Confidence ${filled}/5`}
      aria-label={`Confidence ${filled} of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-sm",
            i < filled ? "bg-foreground/70" : "bg-foreground/15",
          )}
          style={{ height: `${4 + i * 2}px` }}
          aria-hidden
        />
      ))}
    </div>
  );
}
