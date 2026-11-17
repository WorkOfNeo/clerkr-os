import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tal",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** The browser's own chrome follows the board's light/dark (ops-board.css). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#151814" },
  ],
};

/**
 * The numbers board. No AppShell, no sidebar, no command palette: a share link
 * reaches this board and nothing else, so nothing here may point at the rest
 * of clerkr-internal. Access is checked per page and per poll (./gate.ts),
 * because a layout is not re-rendered when moving between its pages.
 */
export default function NumbersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
