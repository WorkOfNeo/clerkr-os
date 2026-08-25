import Link from "next/link";

import { KindBadge } from "@/components/log/KindBadge";
import { LogComposer } from "@/components/log/LogComposer";
import { LogEntryRow } from "@/components/log/LogEntryRow";
import { ReviewAllButton } from "@/components/log/ReviewAllButton";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { LOG_KINDS, LOG_KIND_ORDER } from "@/lib/log-kinds";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import type { LogKind } from "@prisma/client";

const PAGE_SIZE = 100;

function isKind(v: string | undefined): v is LogKind {
  return Boolean(v) && (LOG_KIND_ORDER as string[]).includes(v as string);
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; thread?: string; review?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const kind = isKind(params.kind) ? params.kind : undefined;
  const reviewOnly = params.review === "1";

  const [entries, threads, unreviewedCount, kindCounts] = await Promise.all([
    db.logEntry.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(reviewOnly ? { reviewed: false } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        body: true,
        source: true,
        reviewed: true,
        repo: true,
        branch: true,
        occurredAt: true,
        thread: { select: { id: true, slug: true, title: true } },
        feature: { select: { slug: true, title: true } },
      },
    }),
    db.thread.findMany({
      where: { state: { in: ["OPEN", "PARKED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
    db.logEntry.count({ where: { reviewed: false } }),
    db.logEntry.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);

  const countFor = (k: LogKind) =>
    kindCounts.find((c) => c.kind === k)?._count._all ?? 0;

  const filterHref = (next: LogKind | undefined) => {
    const sp = new URLSearchParams();
    if (next) sp.set("kind", next);
    if (reviewOnly) sp.set("review", "1");
    const q = sp.toString();
    return q ? `/log?${q}` : "/log";
  };

  // Group by day so the feed reads like a journal rather than a table.
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.occurredAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(e);
    else byDay.set(key, [e]);
  }

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Work log</h1>
            <p className="text-sm text-muted-foreground">
              What you decided, what worked, what didn&apos;t, and what it threw off.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/threads">Threads →</Link>
          </Button>
        </div>

        <LogComposer threads={threads} />

        {unreviewedCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-sky-500/50 bg-sky-500/[0.04] px-3 py-2 text-sm">
            <span>
              <strong>{unreviewedCount}</strong>{" "}
              {unreviewedCount === 1 ? "entry" : "entries"} captured from your Claude
              sessions.
            </span>
            <div className="flex items-center gap-3 text-xs">
              <Link
                href={reviewOnly ? filterHref(kind) : "/log?review=1"}
                className="text-sky-400 hover:underline"
              >
                {reviewOnly ? "Show everything" : "Review them"}
              </Link>
              <ReviewAllButton />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1">
          <Link
            href={filterHref(undefined)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              !kind
                ? "border-foreground/30 bg-accent text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </Link>
          {LOG_KIND_ORDER.map((k) => (
            <Link
              key={k}
              href={filterHref(kind === k ? undefined : k)}
              title={LOG_KINDS[k].hint}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                kind === k
                  ? LOG_KINDS[k].className
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {LOG_KINDS[k].label}
              <span className="ml-1 opacity-60">{countFor(k)}</span>
            </Link>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {reviewOnly || kind
              ? "Nothing here with that filter."
              : "Nothing logged yet. Make a call, start doing it, and log what happens."}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {[...byDay.entries()].map(([day, dayEntries]) => (
              <section key={day}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                  <span className="h-px flex-1 bg-border" />
                  <span className="flex gap-1">
                    {[...new Set(dayEntries.map((e) => e.kind))].map((k) => (
                      <KindBadge key={k} kind={k} className="scale-90" />
                    ))}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {dayEntries.map((e) => (
                    <LogEntryRow key={e.id} entry={e} threads={threads} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {entries.length === PAGE_SIZE && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Showing the most recent {PAGE_SIZE} entries. Use the filters or ask the Copilot
            in <Link href="/chat" className="underline">Chat</Link> to search further back.
          </p>
        )}
      </main>
    </div>
  );
}
