"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { NumbersScope } from "@/lib/numbers/access";

import { TABS } from "./tabs";

/**
 * The tabs, and the TV loop: every tab stays up DWELL_MS (30 s), then the board moves
 * on to the next tab the viewer may see (Drift → Website → Omsætning → …).
 * Navigation is client-side, so each page's numbers are read fresh and roll in
 * (Odometer, ops-board.css enter motion). The hairline under the active tab
 * fills toward the switch. A hidden browser tab pauses the loop; clicking a
 * tab simply starts that tab's 30 s.
 *
 * `base` is where the board is mounted (./tabs.ts): /numbers, or a share
 * link's /n/<token> — which is how the loop stays on the link.
 */

export const DWELL_MS = 30_000;

export function NumbersTabs({ scopes, active, base }: { scopes: NumbersScope[]; active: NumbersScope; base: string }) {
  const router = useRouter();
  const tabs = TABS.filter((t) => scopes.includes(t.scope)).map((t) => ({ ...t, href: base + t.path }));
  const idx = tabs.findIndex((t) => t.scope === active);
  const next = tabs.length > 1 ? tabs[(idx + 1) % tabs.length] : null;

  useEffect(() => {
    if (!next) return;
    router.prefetch(next.href);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.push(next.href), DWELL_MS);
    };
    const onVisibility = () => (document.hidden ? clearTimeout(timer) : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [next, router]);

  if (tabs.length < 2) return null;
  return (
    <nav className="ob-tabs" aria-label="Tal">
      {tabs.map((t) => (
        <Link key={t.scope} href={t.href} className="ob-tab" aria-current={t.scope === active ? "page" : undefined}>
          {t.label}
          {t.scope === active ? (
            <i key={active} className="ob-tab-next" aria-hidden style={{ animationDuration: `${DWELL_MS}ms` }} />
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
