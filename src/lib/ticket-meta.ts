// Presentation + vocabulary for ticket status and priority. Categories are NOT
// here — those are editable rows in `ticket_category`, maintained at
// /settings/categories, so they carry their own label and colour from the DB.

import type { TicketPriority, TicketSource, TicketStatus } from "@prisma/client";

export interface StatusMeta {
  label: string;
  hint: string;
  className: string;
  /** True once the ticket no longer needs attention — drives the default filter. */
  resolved: boolean;
}

export const TICKET_STATUSES: Record<TicketStatus, StatusMeta> = {
  OPEN: {
    label: "Open",
    hint: "Raised, nobody's on it yet.",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    resolved: false,
  },
  IN_PROGRESS: {
    label: "In progress",
    hint: "Being worked on right now.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    resolved: false,
  },
  FIXED: {
    label: "Fixed",
    hint: "Done in code, not released yet.",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    resolved: true,
  },
  SHIPPED: {
    label: "Shipped",
    hint: "Out and live.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    resolved: true,
  },
  WONT_FIX: {
    label: "Won't fix",
    hint: "Closed deliberately without doing it.",
    className: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    resolved: true,
  },
};

export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "FIXED",
  "SHIPPED",
  "WONT_FIX",
];

export const OPEN_STATUSES = TICKET_STATUS_ORDER.filter((s) => !TICKET_STATUSES[s].resolved);

export const TICKET_PRIORITIES: Record<TicketPriority, { label: string; className: string }> = {
  LOW: { label: "Low", className: "text-muted-foreground" },
  MEDIUM: { label: "Medium", className: "text-muted-foreground" },
  HIGH: { label: "High", className: "text-amber-400" },
  URGENT: { label: "Urgent", className: "text-rose-400" },
};

export const TICKET_PRIORITY_ORDER: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const TICKET_SOURCES: Record<TicketSource, string> = {
  MANUAL: "filed here",
  MCP: "via Claude",
  MEETING: "from a meeting",
};

/** Injected into MCP tool descriptions so the model uses the same vocabulary. */
export function statusVocabulary(): string {
  return TICKET_STATUS_ORDER.map((s) => `${s} (${TICKET_STATUSES[s].hint})`).join("; ");
}

/** The categories a fresh install starts with. Re-seeding is keyed on slug. */
export const DEFAULT_CATEGORIES = [
  { slug: "idea", label: "Idea", color: "#38bdf8", sortOrder: 0 },
  { slug: "bug", label: "Bug", color: "#f43f5e", sortOrder: 1 },
  { slug: "feature-request", label: "Feature request", color: "#a78bfa", sortOrder: 2 },
  { slug: "question", label: "Question", color: "#f59e0b", sortOrder: 3 },
] as const;
