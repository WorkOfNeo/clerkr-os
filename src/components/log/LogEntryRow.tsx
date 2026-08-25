"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteEntry, fileEntry, reviewEntry, updateEntry } from "@/app/log/actions";
import { KindBadge } from "@/components/log/KindBadge";
import type { ThreadOption } from "@/components/log/LogComposer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDate } from "@/lib/format";
import { LOG_KINDS, LOG_KIND_ORDER, LOG_SOURCES } from "@/lib/log-kinds";
import { cn } from "@/lib/utils";

import type { LogKind, LogSource } from "@prisma/client";

export interface LogEntryView {
  id: string;
  kind: LogKind;
  body: string;
  source: LogSource;
  reviewed: boolean;
  repo: string | null;
  branch: string | null;
  occurredAt: Date;
  thread: { id: string; slug: string; title: string } | null;
  feature: { slug: string; title: string } | null;
}

export function LogEntryRow({
  entry,
  threads,
  hideThread,
}: {
  entry: LogEntryView;
  threads: ThreadOption[];
  /** On a thread page the thread is the page — don't repeat it on every row. */
  hideThread?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(entry.body);
  const [kind, setKind] = useState<LogKind>(entry.kind);

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "group rounded-lg border bg-card p-3 transition-colors",
        // Unreviewed = written by the AI and not yet looked at. Marked, not
        // hidden — an entry you never confirm is still better than no entry.
        !entry.reviewed && "border-dashed border-sky-500/50 bg-sky-500/[0.04]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <KindBadge kind={entry.kind} />
        <span>{formatShortDate(entry.occurredAt)}</span>
        {entry.source !== "MANUAL" && <span>· {LOG_SOURCES[entry.source]}</span>}
        {entry.repo && (
          <span className="font-mono text-[11px]">
            · {entry.repo}
            {entry.branch ? `@${entry.branch}` : ""}
          </span>
        )}
        {!hideThread && entry.thread && (
          <Link
            href={`/threads/${entry.thread.slug}`}
            className="rounded bg-accent px-1.5 py-0.5 text-foreground hover:underline"
          >
            {entry.thread.title}
          </Link>
        )}
        {entry.feature && (
          <Link href={`/features/${entry.feature.slug}`} className="text-sky-400 hover:underline">
            → {entry.feature.title}
          </Link>
        )}
        {!entry.reviewed && <span className="text-sky-400">· needs review</span>}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          <div className="flex flex-wrap gap-1">
            {LOG_KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  kind === k
                    ? LOG_KINDS[k].className
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {LOG_KINDS[k].label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending || !body.trim()}
              onClick={() =>
                run(async () => {
                  await updateEntry({ id: entry.id, body, kind });
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBody(entry.body);
                setKind(entry.kind);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
      )}

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!entry.reviewed && (
            <button
              className="text-sky-400 hover:underline"
              disabled={isPending}
              onClick={() => run(() => reviewEntry(entry.id))}
            >
              Keep
            </button>
          )}
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          {!hideThread && (
            <select
              value={entry.thread?.id ?? ""}
              disabled={isPending}
              onChange={(e) => run(() => fileEntry(entry.id, e.target.value || null))}
              className="h-6 rounded border bg-background px-1 text-[11px] text-muted-foreground"
            >
              <option value="">No thread</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <button
            className="ml-auto text-muted-foreground hover:text-destructive"
            disabled={isPending}
            onClick={() => run(() => deleteEntry(entry.id))}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
