import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Clerkr Ideas",
  description: "Internal idea board, populated via MCP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
