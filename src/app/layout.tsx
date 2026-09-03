import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { MotionProvider } from "@/components/MotionProvider";
import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

// SF Pro is used where it exists (Apple hardware); Inter is the fallback so
// Windows gets the same proportions instead of dropping to Segoe UI.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clerkr OS",
  description: "Internal Product OS — chat intake, tickets, kanban, meetings, features.",
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
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
