"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

/**
 * Tooltips for icon-only controls.
 *
 * A tooltip is a label, never an explanation — if a control needs a sentence to
 * be understood, the control is wrong. Every trigger still carries its own
 * `aria-label`, because a tooltip is invisible to touch and to a screen reader
 * that isn't hovering.
 *
 * `delayDuration` is short but not zero: instant tooltips flicker as the
 * pointer crosses a toolbar.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[60] rounded-md bg-foreground px-2 py-1 text-[12px] font-medium text-background shadow-md",
        "data-[state=delayed-open]:animate-scale-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * The common case in one component: wrap a control, give it a label.
 * `<Tooltip label="Dictate"><button …/></Tooltip>`
 */
export function Tooltip({
  label,
  children,
  side = "top",
  disabled,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Skip the tooltip without unmounting the control it wraps. */
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipRoot>
  );
}
