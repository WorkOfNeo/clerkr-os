"use client";

import { AnimatePresence, motion } from "motion/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

import { cn } from "@/lib/utils";

// ⌘K navigation. Deliberately scoped to jumping around the app rather than
// searching content — the Copilot in /chat already does semantic search, and
// two half-search boxes are worse than one good one.

interface Command {
  label: string;
  hint?: string;
  href: string;
  keywords: string;
}

const COMMANDS: Command[] = [
  { label: "Tickets", hint: "Open queue", href: "/tickets", keywords: "ticket bug idea request queue" },
  { label: "New ticket", hint: "Raise something", href: "/tickets?new=1", keywords: "new create ticket bug report raise" },
  { label: "Meetings", hint: "Briefs", href: "/meetings", keywords: "meeting transcript brief notes" },
  { label: "New meeting", hint: "Paste a transcript", href: "/meetings/new", keywords: "new meeting transcript paste" },
  { label: "Features", hint: "Library", href: "/features", keywords: "feature library capability" },
  { label: "Kanban", hint: "The board", href: "/kanban", keywords: "kanban board column status roadmap lane card swimlane workflow" },
  { label: "Knowledge", hint: "Graph", href: "/knowledge", keywords: "knowledge graph cluster" },
  { label: "Wiki", hint: "Notes", href: "/wiki", keywords: "wiki note documentation knowledge" },
  { label: "New wiki note", href: "/wiki/new", keywords: "new wiki note write" },
  { label: "Documents", hint: "File store", href: "/documents", keywords: "document file pdf jpg image upload attachment store contract deck spreadsheet" },
  { label: "Intake", hint: "File anything", href: "/chat", keywords: "intake chat copilot ask assistant ai paste notes file capture" },
  { label: "Ideas", hint: "Inspiration board", href: "/grid", keywords: "idea board grid inspiration pinterest" },
  { label: "Ticket categories", hint: "Settings", href: "/settings/categories", keywords: "category categories tag type settings edit" },
  { label: "AI prompts", hint: "Settings", href: "/settings/prompts", keywords: "prompt ai system settings edit" },
  { label: "Install & notifications", hint: "Settings", href: "/settings/notifications", keywords: "install pwa app home screen notification push alert bell iphone safari" },
  { label: "Settings", hint: "Tokens & MCP", href: "/settings", keywords: "settings token api mcp connect" },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    onOpenChange(false);
    router.push(cmd.href);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[70] bg-foreground/20 backdrop-blur-[3px]"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                // Same as the modal: x lives in motion, not in a translate class.
                style={{ x: "-50%" }}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
                className="fixed left-1/2 top-[18vh] z-[70] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-hairline"
              >
                <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>

                <div className="flex items-center gap-2.5 border-b border-hairline px-4">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((a) => Math.min(a + 1, results.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive((a) => Math.max(a - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        run(results[active]);
                      }
                    }}
                    placeholder="Jump to…"
                    className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
                  />
                  <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    esc
                  </kbd>
                </div>

                <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
                  {results.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                      Nothing matches “{query}”.
                    </p>
                  ) : (
                    results.map((cmd, i) => (
                      <button
                        key={cmd.href}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => run(cmd)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                          i === active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="text-[13px] font-medium">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="text-xs text-muted-foreground">{cmd.hint}</span>
                        )}
                        {i === active && (
                          <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
