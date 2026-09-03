"use client";

import { MotionConfig } from "motion/react";

/**
 * `reducedMotion="user"` makes motion honour the OS setting. The
 * prefers-reduced-motion block in globals.css only reaches CSS animations —
 * JS-driven ones need this, or someone who asked for calm still gets sliding
 * panels and springing rows.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
