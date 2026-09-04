"use client";

import { useEffect, useState } from "react";

/**
 * Is this a touch device — a phone or tablet rather than a machine with a
 * pointer and a real keyboard?
 *
 * `pointer: coarse` is the right test rather than a user-agent sniff or a
 * width breakpoint: it asks what the person is actually pointing with. A
 * narrow desktop window is still a desktop, and an iPad with a keyboard still
 * has a coarse primary pointer.
 *
 * Resolved after mount, so the server render and the first client render agree
 * — there is no way to know this on the server, and guessing causes a
 * hydration mismatch.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);

    // A tablet gaining or losing a keyboard changes the answer.
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
