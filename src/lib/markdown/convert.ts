import { marked } from "marked";
import TurndownService from "turndown";

/**
 * Markdown ⇄ HTML, so the editor can be live while STORAGE stays markdown.
 *
 * Storage matters here: `KanbanCard.description` is read by the Copilot, by
 * MCP tools and by the wiki's renderer. Persisting the editor's own JSON would
 * make it opaque to all three, so the rich editor converts on the way in and
 * on the way out and markdown remains the source of truth.
 */

let turndown: TurndownService | null = null;

function service(): TurndownService {
  if (turndown) return turndown;
  turndown = new TurndownService({
    headingStyle: "atx", // "## Heading", matching how people type it
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });

  // TipTap's task lists are <ul data-type="taskList"> with checkboxes inside;
  // Turndown would otherwise flatten them to plain bullets and lose the state.
  turndown.addRule("taskListItem", {
    filter: (node) =>
      node.nodeName === "LI" && node.getAttribute("data-checked") !== null,
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
      return `- [${checked ? "x" : " "}] ${content.trim()}\n`;
    },
  });

  return turndown;
}

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  return marked.parse(markdown, { async: false }) as string;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim() || html === "<p></p>") return "";
  return service().turndown(html).trim();
}

/**
 * A plain-text excerpt for places too small for formatting — the card face on
 * the board, a search result. Strips the syntax rather than rendering it, so a
 * note starting with "## Context" doesn't show up as literal hashes.
 */
export function markdownExcerpt(markdown: string | null | undefined, max = 140): string {
  if (!markdown) return "";
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading marks
    .replace(/^\s{0,3}>\s?/gm, "") // quotes
    .replace(/^\s*[-*+]\s+\[[ x]\]\s*/gim, "") // task boxes
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbers
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, " ") // rules
    .replace(/[*_~`]/g, "") // inline marks
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
