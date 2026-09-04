import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { MotionProvider } from "@/components/MotionProvider";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// SF Pro is used where it exists (Apple hardware); Inter is the fallback so
// Windows gets the same proportions instead of dropping to Segoe UI.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // Every page supplies its own name; this appends the app so a tab, a task
  // switcher and the installed window all read "<page> · Clerkr OS".
  title: {
    default: "Clerkr OS",
    template: "%s · Clerkr OS",
  },
  description: "Internal Product OS — chat intake, tickets, kanban, meetings, features.",

  // `app/manifest.ts` makes Next emit <link rel="manifest"> on its own, but
  // NOT the Apple tags — iOS reads these and nothing else, which is why "Add
  // to Home Screen" showed a grey letter without them.
  appleWebApp: {
    capable: true,
    title: "Clerkr OS",
    // `default` keeps the status bar legible; black-translucent would put its
    // text under our own header.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Behind auth — there is nothing to index, and a stray crawl of an internal
  // tool is only ever a liability.
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FBFBFD",
  width: "device-width",
  initialScale: 1,
  // Let the layout breathe on iOS without the zoom-on-focus jump.
  maximumScale: 5,
  // Installed, the app runs edge to edge — `cover` is what exposes the
  // safe-area insets that globals.css then pads with, so nothing hides under
  // the notch or the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/*
          Applies the saved sidebar width BEFORE first paint. The width lives in
          a CSS variable rather than React state precisely so this can run here
          — reading localStorage during render would either mismatch on
          hydration or flash the wrong width for a frame.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('sidebar')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <MotionProvider>
          <TooltipProvider delayDuration={350} skipDelayDuration={300}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
