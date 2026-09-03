"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { cn } from "@/lib/utils";

// An Apple-style segmented control. The selected pill is a shared layout
// element, so switching segments slides it rather than repainting — that
// single detail is most of what makes the control feel native.

export interface Segment {
  value: string;
  label: string;
  count?: number;
  href?: string;
  /** Optional accent (used for ticket categories, which colour themselves). */
  color?: string;
}

export function Segmented({
  segments,
  value,
  onChange,
  layoutId = "segmented-pill",
  className,
  size = "md",
}: {
  segments: Segment[];
  value: string;
  onChange?: (value: string) => void;
  layoutId?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5",
        className,
      )}
    >
      {segments.map((s) => {
        const active = s.value === value;
        const inner = (
          <>
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                className="absolute inset-0 rounded-[7px] bg-card shadow-xs ring-1 ring-hairline"
                style={s.color ? { backgroundColor: `${s.color}1f` } : undefined}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {s.label}
              {s.count !== undefined && (
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-muted-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {s.count}
                </span>
              )}
            </span>
          </>
        );

        const classes = cn(
          "relative rounded-[7px] font-medium transition-colors duration-150",
          pad,
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        );

        return s.href ? (
          <Link key={s.value} href={s.href} className={classes} style={active && s.color ? { color: s.color } : undefined}>
            {inner}
          </Link>
        ) : (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange?.(s.value)}
            className={classes}
            style={active && s.color ? { color: s.color } : undefined}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
