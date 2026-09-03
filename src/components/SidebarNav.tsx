"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, PanelLeft, Search, Settings } from "lucide-react";

import { ClerkrLogo } from "@/components/ClerkrLogo";
import { CommandPalette } from "@/components/CommandPalette";
import { isActive, NAV_SECTIONS } from "@/components/nav-items";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SidebarNav({
  email,
  openTickets,
  unreadNotifications,
}: {
  email: string;
  openTickets: number;
  unreadNotifications: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // The width itself is CSS (--sidebar-w, set by a blocking script in layout),
  // so this state only mirrors it for labels/aria — no flash, no mismatch.
  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? "collapsed" : "";
    try {
      localStorage.setItem("sidebar", next ? "collapsed" : "expanded");
    } catch {
      /* private mode — the preference just doesn't persist */
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/signin");
    router.refresh();
  }

  const badgeFor = (href: string) => (href === "/tickets" ? openTickets : undefined);

  return (
    <>
      <aside
        data-collapsed={collapsed || undefined}
        className="group/sb sticky top-0 hidden h-screen shrink-0 flex-col gap-1 bg-sidebar px-3 py-3 transition-[width] duration-300 ease-apple md:flex"
        style={{ width: "var(--sidebar-w)" }}
      >
        <div className="mb-1 flex items-center gap-2 px-1">
          <Link
            href="/chat"
            className="pressable flex min-w-0 items-center gap-2 text-[14px] font-semibold tracking-[-0.018em]"
          >
            <ClerkrLogo className="h-4 w-auto shrink-0" />
            <span className={cn("truncate", collapsed && "hidden")}>Clerkr OS</span>
          </Link>
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "pressable ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground",
              collapsed && "ml-0",
            )}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "pressable mb-1 flex h-8 items-center gap-2 rounded-md bg-black/[0.04] px-2 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.07] hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span>Search</span>
              <kbd className="ml-auto rounded bg-card px-1.5 py-0.5 font-sans text-[11px] shadow-xs">
                ⌘K
              </kbd>
            </>
          )}
        </button>

        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.label ?? `primary-${i}`} className="flex flex-col gap-0.5">
              {section.label && !collapsed && (
                <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const badge = badgeFor(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-150",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {/* The selected pill is a shared layout element, so moving
                        between items slides it rather than repainting. */}
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                        className="absolute inset-0 rounded-md bg-card shadow-xs ring-1 ring-hairline"
                      />
                    )}
                    <item.icon className="relative z-10 h-4 w-4 shrink-0" strokeWidth={2} />
                    {!collapsed && (
                      <>
                        <span className="relative z-10 truncate">{item.label}</span>
                        {badge !== undefined && badge > 0 && (
                          <span className="relative z-10 ml-auto rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-0.5 pt-2">
          <NotificationBell initialUnread={unreadNotifications} collapsed={collapsed} />
          <Link
            href="/settings"
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-black/[0.04]",
                collapsed && "justify-center px-0",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold uppercase text-primary-foreground">
                {email.slice(0, 1)}
              </span>
              {!collapsed && (
                <>
                  <span className="truncate text-[12.5px] text-muted-foreground">{email}</span>
                  <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>

            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
                // Anchored to its trigger — it grows out of the button rather
                // than appearing from nowhere.
                style={{ transformOrigin: "bottom left" }}
                className="absolute bottom-full left-0 z-50 mb-1.5 w-52 rounded-lg bg-card p-1 shadow-pop"
              >
                <button
                  onMouseDown={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </aside>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
