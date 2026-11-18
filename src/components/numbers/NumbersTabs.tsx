"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { NumbersScope } from "@/lib/numbers/access";

import { useLoopPaused } from "./loop";
import { tabsFor, type TabId } from "./tabs";

/**
 * The tabs, and the TV loop: every tab stays up its dwell (./tabs.ts — 30 s,
 * the logo 10 s), then the board moves on to the next tab the viewer may see
 * (Drift → Website → Omsætning → Logo → …). Navigation is client-side, so
 * each page's numbers are read fresh and roll in. A small ring in the board's
 * top-right corner fills toward the switch — on every slide, the logo slide
 * included, since it is the only thing that shows the loop is paused.
 *
 * Pausing — the logo (LoopToggle), or the TV hiding the browser tab — stops
 * the loop exactly where it is: the time left is kept, the ring stands still
 * mid-fill, and resuming carries on from that spot rather than restarting the
 * tab. Nothing on the board says "paused" in words. Clicking a tab starts that
 * tab's own dwell, paused or not.
 *
 * The next tab is prefetched PREFETCH_LEAD_MS before the switch, not on
 * mount: on a TV the first seconds belong to hydrating the page it just got.
 * The tab links don't prefetch on their own for the same reason.
 *
 * `base` is where the board is mounted (./tabs.ts): /numbers, or a share
 * link's /n/<token> — which is how the loop stays on the link. `chrome={false}`
 * runs the loop without drawing the tabs (the logo slide).
 */

const PREFETCH_LEAD_MS = 5_000;

export function NumbersTabs({
  scopes,
  active,
  base,
  chrome = true,
}: {
  scopes: NumbersScope[];
  active: TabId;
  base: string;
  chrome?: boolean;
}) {
  const router = useRouter();
  const paused = useLoopPaused();
  const [hidden, setHidden] = useState(false);

  const tabs = tabsFor(scopes).map((t) => ({ ...t, href: base + t.path }));
  const idx = tabs.findIndex((t) => t.id === active);
  const dwellMs = tabs[idx]?.dwellMs ?? 30_000;
  const nextHref = tabs.length > 1 ? tabs[(idx + 1) % tabs.length].href : null;

  // Time left on this tab, carried across pauses.
  const left = useRef(dwellMs);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = nextHref !== null && !paused && !hidden;

  useEffect(() => {
    if (!running || !nextHref) return;
    const startedAt = performance.now();
    const ms = left.current;
    const prefetch = setTimeout(() => router.prefetch(nextHref), Math.max(0, ms - PREFETCH_LEAD_MS));
    const advance = setTimeout(() => router.push(nextHref), ms);
    return () => {
      clearTimeout(prefetch);
      clearTimeout(advance);
      left.current = Math.max(0, ms - (performance.now() - startedAt));
    };
  }, [running, nextHref, router]);

  // The countdown ring. Absolutely positioned against .ob-root, so it sits in
  // the same corner whichever slide drew it. No loop (a single tab), no ring.
  const ring = nextHref ? (
    <svg className="ob-countdown" viewBox="0 0 16 16" aria-hidden focusable="false">
      <circle className="ob-countdown-track" cx="8" cy="8" r="6" />
      <circle
        className="ob-countdown-arc"
        cx="8"
        cy="8"
        r="6"
        style={{ animationDuration: `${dwellMs}ms`, animationPlayState: running ? "running" : "paused" }}
      />
    </svg>
  ) : null;

  if (!chrome || tabs.length < 2) return ring;
  return (
    <>
      <nav className="ob-tabs" aria-label="Tal">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            prefetch={false}
            className="ob-tab"
            aria-current={t.id === active ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {ring}
    </>
  );
}
