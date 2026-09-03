import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[68px] w-full rounded-md bg-card px-3 py-2.5 text-[14px] leading-relaxed text-foreground",
      "shadow-xs ring-1 ring-inset ring-input transition-shadow duration-150 ease-apple",
      "placeholder:text-muted-foreground/70",
      "focus:outline-none focus:ring-2 focus:ring-primary/70",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
