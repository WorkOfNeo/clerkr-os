import { z } from "zod";

import { db } from "@/lib/db";
import { TICKET_STATUSES, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";
import { ticketListSelect } from "@/lib/tickets";

import type { ToolDef } from "./types";

// Read-only rollups over the ticket queue. Deliberately not velocity metrics —
// with a team of one those are noise. What's worth asking: what's waiting on
// me, what's gone stale, and what's piled up in one category.

const OPEN_STATUSES = TICKET_STATUS_ORDER.filter((s) => !TICKET_STATUSES[s].resolved);

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export const ANALYTICS_TOOLS: ToolDef[] = [
  {
    name: "ticket_pulse",
    description:
      "State of the ticket queue: counts by status and by category, how many came in and were closed over the last N days (default 14), and the current open backlog. Use to answer 'what's on my plate?'.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "Window. Default 14." },
      },
    },
    handler: async (args) => {
      const { days = 14 } = z
        .object({ days: z.number().int().min(1).max(365).optional() })
        .parse(args);
      const from = since(days);

      const [byStatus, categories, raised, closed, open] = await Promise.all([
        db.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
        db.ticketCategory.findMany({
          orderBy: { sortOrder: "asc" },
          select: { label: true, _count: { select: { tickets: true } } },
        }),
        db.ticket.count({ where: { createdAt: { gte: from } } }),
        db.ticket.count({ where: { resolvedAt: { gte: from } } }),
        db.ticket.count({ where: { status: { in: OPEN_STATUSES as never } } }),
      ]);

      return {
        window: { days, since: from },
        openBacklog: open,
        raisedInWindow: raised,
        closedInWindow: closed,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        byCategory: Object.fromEntries(categories.map((c) => [c.label, c._count.tickets])),
      };
    },
  },
  {
    name: "stale_tickets",
    description:
      "Open tickets with no activity in the last N days (default 21) — the ones that quietly fell off. Either pick them back up or close them as WONT_FIX.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "Default 21." },
      },
    },
    handler: async (args) => {
      const { days = 21 } = z
        .object({ days: z.number().int().min(1).max(365).optional() })
        .parse(args);
      const cutoff = since(days);

      const tickets = await db.ticket.findMany({
        where: { status: { in: OPEN_STATUSES as never }, updatedAt: { lt: cutoff } },
        orderBy: { updatedAt: "asc" },
        take: 100,
        select: ticketListSelect,
      });
      return {
        cutoff,
        tickets: tickets.map((t) => ({
          ...t,
          daysQuiet: Math.floor((Date.now() - t.updatedAt.getTime()) / 86_400_000),
        })),
        count: tickets.length,
      };
    },
  },
];
