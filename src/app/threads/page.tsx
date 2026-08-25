import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { KindBadge } from "@/components/log/KindBadge";
import { NewThreadForm } from "@/components/thread/NewThreadForm";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { THREAD_STATES, THREAD_STATE_ORDER } from "@/lib/log-kinds";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import type { LogKind, ThreadState } from "@prisma/client";

export default async function ThreadsPage() {
  const session = await requireSession();

  const threads = await db.thread.findMany({
    orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      decision: true,
      state: true,
      startedAt: true,
      closedAt: true,
      updatedAt: true,
      cluster: { select: { name: true } },
      _count: { select: { entries: true } },
      entries: {
        orderBy: { occurredAt: "desc" },
        take: 6,
        select: { kind: true },
      },
    },
  });

  const grouped = THREAD_STATE_ORDER.map((state) => ({
    state,
    items: threads.filter((t) => t.state === state),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Threads</h1>
            <p className="text-sm text-muted-foreground">
              One thread per call you&apos;ve made. Close it and the AI writes what came of it.
            </p>
          </div>
          <NewThreadForm />
        </div>

        {threads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No threads yet. Start one here, or just log a decision on the{" "}
            <Link href="/log" className="text-foreground underline">
              work log
            </Link>{" "}
            and open a thread from it.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ state, items }) => (
              <section key={state}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {THREAD_STATES[state as ThreadState].label}
                  <span className="opacity-60">{items.length}</span>
                  <span className="h-px flex-1 bg-border" />
                </h2>
                <ul className="space-y-2">
                  {items.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/threads/${t.slug}`}
                        className="block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium">{t.title}</h3>
                          <Badge
                            variant="outline"
                            className={cn("shrink-0", THREAD_STATES[t.state].className)}
                          >
                            {THREAD_STATES[t.state].label}
                          </Badge>
                        </div>
                        {t.decision && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {t.decision}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {t._count.entries}{" "}
                            {t._count.entries === 1 ? "entry" : "entries"}
                          </span>
                          {t.cluster && <span>{t.cluster.name}</span>}
                          <span>
                            {formatShortDate(t.startedAt)}
                            {t.closedAt ? ` → ${formatShortDate(t.closedAt)}` : ""}
                          </span>
                          <span className="flex gap-1">
                            {[...new Set(t.entries.map((e) => e.kind))].map((k: LogKind) => (
                              <KindBadge key={k} kind={k} className="scale-90" />
                            ))}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
