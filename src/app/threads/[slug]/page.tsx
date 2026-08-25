import { marked } from "marked";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { LogComposer } from "@/components/log/LogComposer";
import { LogEntryRow } from "@/components/log/LogEntryRow";
import { ThreadCloseButton } from "@/components/thread/ThreadCloseButton";
import { ThreadStateSelect } from "@/components/thread/ThreadStateSelect";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { LOG_KINDS, LOG_KIND_ORDER } from "@/lib/log-kinds";
import { requireSession } from "@/lib/session";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const thread = await db.thread.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      decision: true,
      why: true,
      state: true,
      outcome: true,
      outcomeAt: true,
      startedAt: true,
      closedAt: true,
      cluster: { select: { name: true, slug: true } },
      feature: { select: { slug: true, title: true } },
      entries: {
        orderBy: { occurredAt: "desc" },
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
      },
    },
  });
  if (!thread) notFound();

  const counts = LOG_KIND_ORDER.map((k) => ({
    kind: k,
    n: thread.entries.filter((e) => e.kind === k).length,
  })).filter((c) => c.n > 0);

  const closed = thread.state === "DONE" || thread.state === "ABANDONED";

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl py-6">
        <Link href="/threads" className="text-xs text-muted-foreground hover:underline">
          ← Threads
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{thread.title}</h1>
              <ThreadStateSelect threadId={thread.id} state={thread.state} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                Started {formatShortDate(thread.startedAt)}
                {thread.closedAt ? ` · closed ${formatShortDate(thread.closedAt)}` : ""}
              </span>
              {thread.cluster && <span>{thread.cluster.name}</span>}
              {thread.feature && (
                <Link href={`/features/${thread.feature.slug}`} className="hover:underline">
                  → {thread.feature.title}
                </Link>
              )}
              {counts.map((c) => (
                <span key={c.kind}>
                  {c.n} {LOG_KINDS[c.kind].label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          <ThreadCloseButton
            threadId={thread.id}
            entryCount={thread.entries.length}
            disabled={!isOpenAIAvailable()}
          />
        </div>

        {(thread.decision || thread.why) && (
          <section className="mt-4 rounded-lg border-l-2 border-l-violet-500/60 bg-card p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              The call
            </h2>
            {thread.decision && (
              <p className="mt-1 whitespace-pre-wrap text-sm">{thread.decision}</p>
            )}
            {thread.why && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {thread.why}
              </p>
            )}
          </section>
        )}

        {thread.outcome && (
          <section className="mt-4 rounded-lg border bg-card p-4">
            <h2 className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What came of it
              {thread.outcomeAt && <span>{formatShortDate(thread.outcomeAt)}</span>}
            </h2>
            <div
              className="prose prose-sm prose-invert mt-2 max-w-none"
              dangerouslySetInnerHTML={{ __html: marked.parse(thread.outcome) as string }}
            />
          </section>
        )}

        {!closed && (
          <div className="mt-6">
            <LogComposer threads={[]} defaultThreadId={thread.id} lockThread />
          </div>
        )}

        <h2 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </h2>
        {thread.entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing logged on this thread yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {thread.entries.map((e) => (
              <LogEntryRow key={e.id} entry={e} threads={[]} hideThread />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
