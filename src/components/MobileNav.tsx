"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, Settings, X } from "lucide-react";

import { ClerkrLogo } from "@/components/ClerkrLogo";
import { CommandPalette } from "@/components/CommandPalette";
import { isActive, NAV_SECTIONS } from "@/components/nav-items";
import { cn } from "@/lib/utils";

/**
 * Small-screen chrome: a translucent bar with the content scrolling under it,
 * and the same nav in a drawer.
 *
 * The drawer slides in from the left and dismisses to the left — enter and exit
 * along the same path, so it goes back where it came from.
 */
export function MobileNav({ openTickets }: { openTickets: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Navigating is what closes it — leaving it open over the new page would
  // hide the thing you just asked for.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className="material pt-safe sticky top-0 z-40 flex h-14 items-center gap-2 px-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          // 44px target — the menu is the only way out of a page on a phone,
          // so it gets a full touch target rather than a padded glyph.
          className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-black/5"
        >
          <Menu className="h-6 w-6" strokeWidth={2} />
        </button>
        <Link href="/chat" className="pressable flex items-center gap-2 text-[14px] font-semibold">
          <ClerkrLogo className="h-4 w-auto" />
          <span>Clerkr OS</span>
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Search"
          className="pressable ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
        >
          <Search className="h-5 w-5" strokeWidth={2} />
        </button>
      </header>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[3px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in md:hidden" />
          <DialogPrimitive.Content className="pt-safe fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col gap-1 bg-sidebar px-3 py-3 shadow-xl outline-none data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in md:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Jump to a section of Clerkr OS
            </DialogPrimitive.Description>

            <div className="mb-2 flex items-center gap-2 px-1">
              <ClerkrLogo className="h-4 w-auto" />
              <span className="text-[14px] font-semibold tracking-[-0.018em]">Clerkr OS</span>
              <DialogPrimitive.Close
                aria-label="Close navigation"
                className="pressable ml-auto rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {NAV_SECTIONS.map((section, i) => (
                <div key={section.label ?? `primary-${i}`} className="flex flex-col gap-0.5">
                  {section.label && (
                    <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
                      {section.label}
                    </p>
                  )}
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex h-11 items-center gap-3 rounded-lg px-2.5 text-[14.5px] font-medium transition-colors",
                          active
                            ? "bg-card text-foreground shadow-xs ring-1 ring-hairline"
                            : "text-muted-foreground",
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span>{item.label}</span>
                        {item.href === "/tickets" && openTickets > 0 && (
                          <span className="ml-auto rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px] tabular-nums">
                            {openTickets}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <Link
              href="/settings"
              className="pb-safe flex h-11 items-center gap-3 rounded-lg px-2.5 text-[14.5px] font-medium text-muted-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
