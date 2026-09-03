import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-9 w-full rounded-md bg-card px-3 text-[14px] text-foreground",
      "shadow-xs ring-1 ring-inset ring-input transition-shadow duration-150 ease-apple",
      "placeholder:text-muted-foreground/70",
      "hover:ring-input/80",
      // The focus ring is the same soft halo used everywhere else, applied here
      // explicitly so it lands on the field rather than the wrapper.
      "focus:outline-none focus:ring-2 focus:ring-primary/70",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
