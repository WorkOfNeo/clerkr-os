"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Modal + Sheet, both on Radix Dialog so focus trapping, escape and scroll
// locking are handled properly. Everything that used to expand inline on the
// page now opens in one of these.
//
// Radix's own mount/unmount is bypassed with forceMount + AnimatePresence so
// the exit animation actually gets to run rather than the node vanishing.

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38, mass: 0.85 };

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

export function ModalContent({
  open,
  children,
  className,
  size = "md",
  title,
  description,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  title?: string;
  description?: string;
}) {
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[3px]"
            />
          </DialogPrimitive.Overlay>

          <DialogPrimitive.Content asChild forceMount>
            <motion.div
              // Centering is expressed as motion values, NOT as -translate-x-1/2
              // utilities: motion sets `transform` inline and would overwrite
              // the class, leaving the dialog hanging off the right edge.
              style={{ x: "-50%", y: "-50%" }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={SPRING}
              className={cn(
                "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)]",
                "max-h-[85vh] overflow-y-auto rounded-2xl bg-card p-5 shadow-xl",
                "ring-1 ring-hairline",
                width,
                className,
              )}
            >
              {(title || description) && (
                <div className="mb-4 pr-8">
                  {title && (
                    <DialogPrimitive.Title className="text-[17px] font-semibold tracking-[-0.02em]">
                      {title}
                    </DialogPrimitive.Title>
                  )}
                  {description && (
                    <DialogPrimitive.Description className="mt-1 text-[13px] text-muted-foreground">
                      {description}
                    </DialogPrimitive.Description>
                  )}
                </div>
              )}
              {/* Radix requires a Title for a11y; supply a hidden one if unused. */}
              {!title && (
                <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
              )}

              <DialogPrimitive.Close
                className="pressable absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>

              {children}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

/**
 * Edge-anchored panel. Slides from the right on desktop and bottom on mobile,
 * and can be flicked away — a drag past the threshold, or with enough velocity,
 * dismisses it the way a sheet should.
 */
export function SheetContent({
  open,
  onClose,
  children,
  className,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  // The slide is a CSS keyframe driven by Radix's own `data-state` rather than a
  // motion `animate`, for two reasons: Radix's Presence already waits for the
  // animation before unmounting (so exit works for free), and it keeps the
  // slide off the same transform that `drag` owns — motion ignores an `animate`
  // on an axis it is dragging, which is a genuinely easy trap. Motion handles
  // the drag only, on an inner layer, so the two never share a transform.
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[3px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed right-0 top-0 z-50 h-full w-full max-w-lg outline-none",
            "data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.45 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120 || info.velocity.x > 500) onClose();
            }}
            className="flex h-full w-full flex-col bg-card shadow-xl ring-1 ring-hairline"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <div className="min-w-0">
                <DialogPrimitive.Title
                  className={cn(
                    "truncate text-[15px] font-semibold tracking-[-0.01em]",
                    !title && "sr-only",
                  )}
                >
                  {title ?? "Panel"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description
                  className={cn(
                    "truncate text-[13px] text-muted-foreground",
                    !description && "sr-only",
                  )}
                >
                  {description ?? "Detail panel"}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                className="pressable shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
