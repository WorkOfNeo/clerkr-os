"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

// Toasts replace the old pattern of "do the mutation and hope the user notices
// the page changed". Every destructive or slow action confirms itself here.

type ToastTone = "default" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (message: string, opts?: { tone?: ToastTone; action?: Toast["action"] }) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TONE: Record<ToastTone, string> = {
  default: "text-foreground",
  success: "text-success",
  error: "text-destructive",
};

const DOT: Record<ToastTone, string> = {
  default: "bg-muted-foreground",
  success: "bg-success",
  error: "bg-destructive",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<ToastApi["toast"]>((message, opts) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone: opts?.tone ?? "default", action: opts?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              // No `y` here: `drag="y"` below owns that transform, and animating
              // it on the same element would be ignored (see modal.tsx).
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
              // Swipe down to dismiss.
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 40) setToasts((list) => list.filter((x) => x.id !== t.id));
              }}
              className="material-thick pointer-events-auto flex w-full cursor-grab items-center gap-2.5 rounded-xl px-3.5 py-2.5 shadow-pop active:cursor-grabbing"
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[t.tone])} />
              <span className={cn("flex-1 text-[13px] font-medium", TONE[t.tone])}>
                {t.message}
              </span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    setToasts((list) => list.filter((x) => x.id !== t.id));
                  }}
                  className="pressable shrink-0 text-[13px] font-semibold text-primary"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
