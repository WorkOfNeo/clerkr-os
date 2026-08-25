// Shared presentation metadata for LogKind / ThreadState. Kept in one place so
// the /log feed, thread pages, MCP tool descriptions and the AI extraction
// prompt all describe an entry the same way.

import type { LogKind, LogSource, ThreadState } from "@prisma/client";

export interface KindMeta {
  label: string;
  /** One line telling you (and the extraction model) what belongs here. */
  hint: string;
  /** Tailwind classes for the badge. */
  className: string;
  glyph: string;
}

export const LOG_KINDS: Record<LogKind, KindMeta> = {
  DECISION: {
    label: "Decision",
    hint: "A call you made and the reasoning behind it.",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    glyph: "◆",
  },
  WORKED: {
    label: "Worked",
    hint: "The right path — what actually worked, so you don't re-derive it.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    glyph: "✓",
  },
  DEAD_END: {
    label: "Dead end",
    hint: "A bad path — tried it, didn't work, and why.",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    glyph: "✕",
  },
  BLOCKER: {
    label: "Blocker",
    hint: "Something stopping progress right now.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    glyph: "▲",
  },
  IDEA: {
    label: "Idea",
    hint: "For later. These roll up into the Feature Library when the thread closes.",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    glyph: "✦",
  },
  QUESTION: {
    label: "Question",
    hint: "Open and unresolved.",
    className: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
    glyph: "?",
  },
  SHIPPED: {
    label: "Shipped",
    hint: "It landed.",
    className: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    glyph: "▸",
  },
  NOTE: {
    label: "Note",
    hint: "Everything else worth remembering.",
    className: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    glyph: "·",
  },
};

// Display order for filter chips and the composer — decision first, noise last.
export const LOG_KIND_ORDER: LogKind[] = [
  "DECISION",
  "WORKED",
  "DEAD_END",
  "BLOCKER",
  "IDEA",
  "QUESTION",
  "SHIPPED",
  "NOTE",
];

export const THREAD_STATES: Record<ThreadState, { label: string; className: string }> = {
  OPEN: { label: "Open", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  DONE: { label: "Done", className: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
  PARKED: { label: "Parked", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  ABANDONED: {
    label: "Abandoned",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
};

export const THREAD_STATE_ORDER: ThreadState[] = ["OPEN", "PARKED", "DONE", "ABANDONED"];

export const LOG_SOURCES: Record<LogSource, string> = {
  MANUAL: "typed",
  MCP: "via Claude",
  SESSION: "from a session",
  MEETING: "from a meeting",
};

/** The kind list rendered into AI prompts, so extraction uses the same vocabulary. */
export function kindVocabulary(): string {
  return LOG_KIND_ORDER.map((k) => `- ${k}: ${LOG_KINDS[k].hint}`).join("\n");
}
