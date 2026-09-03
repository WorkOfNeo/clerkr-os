"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export interface LightboxImage {
  id: string;
  fileName: string;
}

/**
 * Full-screen viewer for ticket screenshots. Replaces the old behaviour of
 * opening the raw bytes in a new browser tab, which dumped you out of the app
 * onto a bare image.
 *
 * Arrow keys page through, the image can be flicked away, and clicking the
 * backdrop closes. Zoom is a double-click toggle rather than a control.
 */
export function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const open = index !== null;
  const [zoomed, setZoomed] = useState(false);

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = (index + delta + images.length) % images.length;
      setZoomed(false);
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open]);

  const current = index !== null ? images[index] : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && current && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[60] bg-foreground/70 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 sm:p-10"
                onClick={onClose}
              >
                <DialogPrimitive.Title className="sr-only">
                  {current.fileName}
                </DialogPrimitive.Title>

                <motion.img
                  key={current.id}
                  src={`/api/attachments/${current.id}`}
                  alt={current.fileName}
                  drag
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.35}
                  onDragEnd={(_, info) => {
                    if (Math.abs(info.offset.y) > 140) onClose();
                    else if (info.offset.x < -110) go(1);
                    else if (info.offset.x > 110) go(-1);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={() => setZoomed((z) => !z)}
                  animate={{ scale: zoomed ? 1.9 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`max-h-[82vh] max-w-full rounded-lg object-contain shadow-xl ${
                    zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                  }`}
                />

                <div
                  className="material-thick mt-4 flex items-center gap-1 rounded-full px-2 py-1.5 shadow-pop"
                  onClick={(e) => e.stopPropagation()}
                >
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => go(-1)}
                        aria-label="Previous"
                        className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-1 text-xs tabular-nums text-muted-foreground">
                        {index + 1} / {images.length}
                      </span>
                      <button
                        onClick={() => go(1)}
                        aria-label="Next"
                        className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <span className="mx-1 h-4 w-px bg-border" />
                    </>
                  )}
                  <span className="max-w-[16rem] truncate px-2 text-xs text-muted-foreground">
                    {current.fileName}
                  </span>
                  <a
                    href={`/api/attachments/${current.id}`}
                    download={current.fileName}
                    aria-label="Open original"
                    target="_blank"
                    rel="noreferrer"
                    className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="pressable rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
