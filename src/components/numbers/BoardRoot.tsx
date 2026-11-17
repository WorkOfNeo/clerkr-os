"use client";

import { useEntered } from "./loop";

/**
 * The board's root element for the server-rendered tabs (ObFrame, the logo
 * slide). `data-enter` is set only when the tab arrived after the first load,
 * which is what the entrance motion in tokens.css keys off (./loop.ts).
 */
export function BoardRoot({ flow = false, children }: { flow?: boolean; children: React.ReactNode }) {
  const entered = useEntered();
  return (
    <div className="ob-root" data-flow={flow || undefined} data-enter={entered || undefined}>
      {children}
    </div>
  );
}
