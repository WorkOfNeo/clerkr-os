import type { Metadata } from "next";

/**
 * Per-page titles and descriptions.
 *
 * The template in layout.tsx appends " · Clerkr OS", so a page passes only its
 * own name — the tab reads "Kanban · Clerkr OS" and the installed app's window
 * title says where you are. Descriptions are for the people using the tool,
 * not for search engines: the whole app is behind auth and marked noindex.
 */
export function pageMetadata(title: string, description: string): Metadata {
  return { title, description };
}

/** Titles for detail pages, where the subject is the useful part. */
export function detailMetadata(subject: string, context: string): Metadata {
  return { title: subject, description: context };
}
