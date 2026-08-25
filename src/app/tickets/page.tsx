import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { CategoryBadge, PriorityLabel, StatusBadge } from "@/components/ticket/TicketBadges";
import { NewTicketForm } from "@/components/ticket/NewTicketForm";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { OPEN_STATUSES, TICKET_STATUSES, TICKET_STATUS_ORDER } from "@/lib/ticket-meta";
import { ticketListSelect } from "@/lib/tickets";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import type { TicketStatus } from "@prisma/client";

function isStatus(v: string | undefined): v is TicketStatus {
  return Boolean(v) && (TICKET_STATUS_ORDER as string[]).includes(v as string);
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  // Default view is the work that still needs attention — a ticket list that
  // opens on 400 shipped items is useless.
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

  const href = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { status: params.status, category: categorySlug, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const q = sp.toString();
    return q ? `/tickets?${q}` : "/tickets";
  };

  const chip = "rounded-full border px-2 py-0.5 text-[11px] font-medium";
  const inactive = "border-border text-muted-foreground hover:text-foreground";

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-4xl py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Tickets</h1>
            <p className="text-sm text-muted-foreground">
              Ideas, bugs, feature requests and questions — raised, commented on, shipped.
            </p>
          </div>
          <NewTicketForm categories={categories} />
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          <Link
            href={href({ status: undefined })}
            className={cn(chip, !status && !showAll ? "border-foreground/30 bg-accent" : inactive)}
          >
            Open <span className="ml-1 opacity-60">{openCount}</span>
          </Link>
          {TICKET_STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={href({ status: status === s ? undefined : s })}
              title={TICKET_STATUSES[s].hint}
              className={cn(chip, status === s ? TICKET_STATUSES[s].className : inactive)}
            >
              {TICKET_STATUSES[s].label} <span className="ml-1 opacity-60">{countFor(s)}</span>
            </Link>
          ))}
          <Link
            href={href({ status: "all" })}
            className={cn(chip, showAll ? "border-foreground/30 bg-accent" : inactive)}
          >
            All
          </Link>
        </div>

        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={href({ category: categorySlug === c.slug ? undefined : c.slug })}
                className={cn(chip, categorySlug !== c.slug && inactive)}
                style={
                  categorySlug === c.slug
                    ? {
                        borderColor: `${c.color}66`,
                        backgroundColor: `${c.color}1a`,
                        color: c.color,
                      }
                    : undefined
                }
              >
                {c.label}
              </Link>
            ))}
            <Link
              href="/settings/categories"
              className={cn(chip, "border-dashed", inactive)}
              title="Add or rename categories"
            >
              + Edit categories
            </Link>
          </div>
        )}

        {tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {status || showAll || categorySlug
              ? "Nothing matches that filter."
              : "No open tickets. Raise the first one above."}
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.slug}`}
                  className="block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        #{t.number}
                      </span>
                      {t.title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <PriorityLabel priority={t.priority} />
                      <CategoryBadge category={t.category} />
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  {t.body && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatShortDate(t.createdAt)}</span>
                    <span>{t.reportedBy ?? (t.author.name || t.author.email)}</span>
                    {t._count.comments > 0 && <span>💬 {t._count.comments}</span>}
                    {t._count.attachments > 0 && <span>📎 {t._count.attachments}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
