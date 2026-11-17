"use client";

import { toggleLoop, useLoopPaused } from "./loop";
import { ClerkrLogo } from "./ops/ClerkrLogo";

/**
 * The board's logo, which is also its play/pause button: one click freezes
 * the slide loop exactly where it is (NumbersTabs), the next carries on from
 * there. While paused a small "Pause" badge sits beside the mark, so a TV
 * across the room says why it has stopped moving.
 *
 * `hero` is the logo slide's version: the mark alone, large, centred.
 */
export function LoopToggle({ hero = false }: { hero?: boolean }) {
  const paused = useLoopPaused();
  const label = paused ? "Fortsæt slides" : "Sæt slides på pause";
  return (
    <button
      type="button"
      className="ob-brand ob-loop"
      data-hero={hero || undefined}
      aria-pressed={paused}
      aria-label={label}
      title={label}
      onClick={toggleLoop}
    >
      <ClerkrLogo className="ob-loop-mark" />
      {hero ? null : <span>Clerkr</span>}
      {paused ? (
        <span className="ob-loop-paused" aria-hidden>
          <svg viewBox="0 0 10 10" fill="currentColor">
            <rect x="1.5" y="1" width="2.5" height="8" rx="0.6" />
            <rect x="6" y="1" width="2.5" height="8" rx="0.6" />
          </svg>
          Pause
        </span>
      ) : null}
    </button>
  );
}
