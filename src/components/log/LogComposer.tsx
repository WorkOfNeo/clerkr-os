"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { captureEntry } from "@/app/log/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LOG_KINDS, LOG_KIND_ORDER } from "@/lib/log-kinds";
import { cn } from "@/lib/utils";

import type { LogKind } from "@prisma/client";

export interface ThreadOption {
  id: string;
  title: string;
}

/**
 * The capture box. Everything else in this app can be slow; this cannot — if
 * logging a dead end takes more than a few seconds you stop doing it, and the
 * log is only worth anything if it's complete. One textarea, one row of kind
 * chips, one optional thread. ⌘/Ctrl+Enter submits.
 */
export function LogComposer({
  threads,
  defaultThreadId,
  lockThread,
}: {
  threads: ThreadOption[];
  defaultThreadId?: string;
  /** On a thread page the entry always belongs here — hide the picker. */
  lockThread?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<LogKind>("NOTE");
  const [body, setBody] = useState("");
  const [thread, setThread] = useState(defaultThreadId ?? "");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!body.trim() || isPending) return;
    setError(null);
    const formData = new FormData();
    formData.set("body", body);
    formData.set("kind", kind);
    formData.set("thread", lockThread ? (defaultThreadId ?? "") : thread);
    formData.set("newThreadTitle", newThreadTitle);

    startTransition(async () => {
      try {
        await captureEntry(formData);
        setBody("");
        setNewThreadTitle("");
        if (!lockThread && thread === "new") setThread("");
        areaRef.current?.focus();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that entry.");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <Textarea
        ref={areaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder="What just happened? A call you made, a path that worked, one that didn't, something blocking you, an idea for later…"
        className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
      />

      <div className="mt-3 flex flex-wrap gap-1">
        {LOG_KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            title={LOG_KINDS[k].hint}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              kind === k
                ? LOG_KINDS[k].className
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden className="mr-1">
              {LOG_KINDS[k].glyph}
            </span>
            {LOG_KINDS[k].label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!lockThread && (
          <>
            <select
              value={thread}
              onChange={(e) => setThread(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">No thread</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
              <option value="new">+ Start a new thread…</option>
            </select>
            {thread === "new" && (
              <input
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                placeholder="Thread title (defaults to this entry)"
                className="h-8 min-w-[16rem] flex-1 rounded-md border bg-background px-2 text-xs"
              />
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">⌘↵</span>
          <Button size="sm" onClick={submit} disabled={!body.trim() || isPending}>
            {isPending ? "Logging…" : "Log it"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
