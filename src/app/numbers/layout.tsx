import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tal",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
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
