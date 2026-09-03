import { cn } from "@/lib/utils";

/**
 * One header for every page, so "where am I / what can I do here" lands in the
 * same place every time. Title, one line of orientation, and the actions that
 * belong to this page — nothing else earns the space.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && (
        <div className="mb-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {breadcrumb}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {/* Large text gets negative tracking; the subtitle stays at 0. */}
          <h1 className="text-display text-[26px] font-semibold leading-[1.15]">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
