import Link from "next/link";
import { Settings2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { NewTicketDialog } from "@/components/ticket/NewTicketDialog";
import { TicketFilters } from "@/components/ticket/TicketFilters";
import { TicketList } from "@/components/ticket/TicketList";
import { db } from "@/lib/db";
import { OPEN_STATUSES, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";
import { ticketListSelect } from "@/lib/tickets";
import { requireSession } from "@/lib/session";

import type { TicketStatus } from "@prisma/client";

function isStatus(v: string | undefined): v is TicketStatus {
  return Boolean(v) && (TICKET_STATUS_ORDER as string[]).includes(v as string);
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; new?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  // Default view is what still needs attention — a queue that opens on 400
  // shipped items is not a queue.
  const status = isStatus(params.status) ? params.status : undefined;
  const showAll = params.status === "all";
  const categorySlug = params.category;

  const [tickets, categories, statusCounts] = await Promise.all([
    db.ticket.findMany({
      where: {
        ...(status ? { status } : showAll ? {} : { status: { in: OPEN_STATUSES } }),
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
      take: 200,
      select: ticketListSelect,
    }),
    db.ticketCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: TicketStatus) =>
    statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const openCount = OPEN_STATUSES.reduce((n, s) => n + countFor(s), 0);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <PageHeader
          title="Tickets"
          subtitle={
            openCount === 0
              ? "Nothing open. Enjoy it."
              : `${openCount} open · ${countFor("SHIPPED")} shipped all time`
          }
          actions={<NewTicketDialog categories={categories} openSignal={params.new ? 1 : 0} />}
        />

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <TicketFilters
            status={params.status}
            categorySlug={categorySlug}
            categories={categories}
            counts={{
              open: openCount,
              ...Object.fromEntries(TICKET_STATUS_ORDER.map((s) => [s, countFor(s)])),
            }}
          />
          <Link
            href="/settings/categories"
            title="Edit categories"
            className="pressable ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="surface flex flex-col items-center gap-1 border-dashed p-14 text-center">
            <p className="text-[15px] font-medium">
              {status || showAll || categorySlug ? "Nothing matches" : "No open tickets"}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {status || showAll || categorySlug
                ? "Try a different filter."
                : "Press N to raise the first one."}
            </p>
          </div>
        ) : (
          <TicketList tickets={tickets} />
        )}
      </main>
    </AppShell>
  );
}
