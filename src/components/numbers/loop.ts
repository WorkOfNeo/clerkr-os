"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Whether the board's slide loop is paused — the logo is the switch
 * (LoopToggle), the tabs obey it (NumbersTabs).
 *
 * A module-level store rather than component state: every tab is its own
 * page, so the header remounts on each switch, and a pause has to survive a
 * click on another tab. It does not survive a reload — a TV that restarts
 * comes back playing.
 */
let paused = false;
const listeners = new Set<() => void>();

export function toggleLoop() {
  paused = !paused;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLoopPaused(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => paused,
    () => false,
  );
}

/**
 * Whether this component arrived AFTER the page's first load — false for
 * everything the hard load hydrates, true for anything mounted later (a tab
 * the loop moved to, a row a poll added).
 *
 * Entrance motion keys off it. On the first load the TV is busy parsing and
 * hydrating the page; rolling every number up from 0 and rising every panel
 * in that same second is what made it stutter. So the first paint just shows
 * the numbers, as Clerkr's own ops-board always did, and motion is kept for
 * the moments it explains something: the loop arriving on a tab, a poll
 * changing a value.
 */
let booted = false;

export function useEntered(): boolean {
  const [entered] = useState(() => booted);
  useEffect(() => {
    booted = true;
  }, []);
  return entered;
}
