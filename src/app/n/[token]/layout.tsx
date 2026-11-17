import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tal",
  robots: { index: false, follow: false, nocache: true },
  // The token is in this page's own address, so nothing it loads may be told it.
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
 * The numbers board opened by a share link: /n/<token>, /n/<token>/website,
 * /n/<token>/revenue, /n/<token>/logo. Same tabs and loop as /numbers; the token stays in the
 * path as the credential (./gate.ts). next.config.ts gives everything under
 * /n/ the board's headers — no Referer, no caching, no indexing, no framing.
 */
export default function NumbersLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
