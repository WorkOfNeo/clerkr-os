import type { MetadataRoute } from "next";

/**
 * PWA manifest, so the app installs from Safari's Share → Add to Home Screen
 * and then runs without browser chrome.
 *
 * `display: standalone` is what removes the address bar. Together with the
 * apple-touch-icon and apple-mobile-web-app-* meta in layout.tsx, this is
 * everything iOS needs — Safari does not require a service worker to install.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id keeps it the SAME installed app across start_url changes —
    // without it, changing start_url can install a second copy.
    id: "/",
    name: "Clerkr OS",
    short_name: "Clerkr",
    description: "Internal Product OS — intake, tickets, kanban, meetings, features.",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    // Falls back left to right where a browser supports a richer mode.
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#FBFBFD",
    theme_color: "#FBFBFD",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate asset: a maskable icon is cropped to a circle on some
      // launchers, so the mark needs its own padding. Reusing the square one
      // gets the logo's edges shaved off.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Intake", short_name: "Intake", url: "/chat" },
      { name: "Kanban", short_name: "Kanban", url: "/kanban" },
      { name: "Tickets", short_name: "Tickets", url: "/tickets" },
    ],
  };
}
