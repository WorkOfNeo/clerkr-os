import { Marked } from "marked";
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
      // Continuation lines (a nested list) indent under the box, as they would
      // under a plain bullet.
      return `- [${checked ? "x" : " "}] ${content.trim().replace(/\n/g, "\n  ")}\n`;
    },
  });

  return turndown;
}

/**
 * The editor's own markdown parser. A separate instance so these overrides
 * can't leak into the global `marked` other pages render with.
 *
 * GFM task lists are the reason it exists. marked renders `- [ ] x` as
 * `<li><input type="checkbox"> x</li>`, which TipTap reads as a PLAIN bullet
 * — the checkbox was dropped on load and the next save wrote `- x`, so every
 * checkbox in a card note silently became a bullet. TipTap wants
 * `<ul data-type="taskList"><li data-type="taskItem" data-checked>`.
 */
const editorMarked = new Marked({
  renderer: {
    list(token) {
      if (token.ordered || !token.items.some((i) => i.task)) return false;
      // TipTap can't mix task and plain items in one list — and a task list
      // followed by a bullet list serialises as ONE mixed list, since both use
      // "-". So split into runs, which is how it was drawn in the editor.
      const runs: { task: boolean; items: typeof token.items }[] = [];
      for (const item of token.items) {
        const last = runs.at(-1);
        if (last && last.task === item.task) last.items.push(item);
        else runs.push({ task: item.task, items: [item] });
      }
      return runs
        .map(
          (run) =>
            `<ul${run.task ? ' data-type="taskList"' : ""}>\n${run.items.map((i) => this.listitem(i)).join("")}</ul>\n`,
        )
        .join("");
    },
    listitem(item) {
      if (!item.task) return false;
      return `<li data-type="taskItem" data-checked="${item.checked ? "true" : "false"}">${this.parser.parse(item.tokens)}</li>\n`;
    },
    // The state rides on the <li> above; the <input> itself would only be
    // dropped by the editor.
    checkbox() {
      return "";
    },
  },
});

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  return editorMarked.parse(markdown, { async: false }) as string;
}

/**
 * Whether pasted plain text is markdown worth rendering rather than inserting
 * literally — what you get copying out of Claude, a README or a terminal.
 * Block syntax at a line start, or unmistakable inline syntax. A sentence that
 * merely contains an asterisk isn't enough.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  return (
    /^\s{0,3}(#{1,6}\s+\S|[-*+]\s+\S|\d+[.)]\s+\S|>\s?\S|```|~~~|\|.+\|\s*$)/m.test(text) ||
    /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\)/.test(text)
  );
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
