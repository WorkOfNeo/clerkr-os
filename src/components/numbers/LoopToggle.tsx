"use client";

import { ClerkrWordmark } from "./ClerkrWordmark";
import { toggleLoop, useLoopPaused } from "./loop";
import { ClerkrLogo } from "./ops/ClerkrLogo";

/**
 * The board's logo — the mark with the CLERK'R wordmark to its right — which
 * is also its play/pause button: one click freezes the slide loop exactly
 * where it is (NumbersTabs), the next carries on from there.
 *
 * The logo never changes with the state: no "Pause" badge, no tooltip. What
 * shows the loop has stopped is the countdown ring in the top-right corner
 * (NumbersTabs), which simply stands still.
 *
 * `hero` is the logo slide's version: the same lockup, large, centred.
 */
export function LoopToggle({ hero = false }: { hero?: boolean }) {
  const paused = useLoopPaused();
  return (
    <button
      type="button"
      className="ob-brand ob-loop"
      data-hero={hero || undefined}
      aria-pressed={paused}
      aria-label={paused ? "Fortsæt slides" : "Sæt slides på pause"}
      onClick={toggleLoop}
    >
      <ClerkrLogo className="ob-loop-mark" />
      <ClerkrWordmark className="ob-loop-word" />
    </button>
  );
}
