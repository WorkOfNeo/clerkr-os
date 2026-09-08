"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PocketTag } from "@/lib/pocket/client";

import { deleteConnection, fetchTags, setConnectionActive, setConnectionTags, syncNow } from "./actions";

export interface ConnectionRow {
  id: string;
  label: string;
  pocketEmail: string;
  active: boolean;
  defaultKind: string;
  ownerLabel: string;
  tagIds: string[];
  lastEventAt: Date | null;
  lastEvent: string | null;
  lastError: string | null;
  lastSeen: number;
  deliveries: number;
  meetingsCreated: number;
}

export function ConnectionList({ connections }: { connections: ConnectionRow[] }) {
  if (connections.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No Pocket accounts connected yet. Follow the steps above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((c) => (
        <ConnectionCard key={c.id} connection={c} />
      ))}
    </div>
  );
}

function ConnectionCard({ connection: c }: { connection: ConnectionRow }) {
  const [pending, setPending] = useState(false);
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{c.label}</span>
            {!c.active && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-wide text-secondary-foreground">
                Paused
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {c.pocketEmail} &middot; files under {c.ownerLabel} as {c.defaultKind.toLowerCase()}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={syncing || c.tagIds.length === 0}
            onClick={() =>
              startSync(async () => {
                const r = await syncNow();
                setSyncMsg(
                  r.error
                    ? r.error
                    : `Checked ${r.seen} tagged recording${r.seen === 1 ? "" : "s"}, imported ${r.imported}.`,
                );
              })
            }
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Checking..." : "Check now"}
          </Button>

          <form
            action={async (fd) => {
              setPending(true);
              try {
                await setConnectionActive(fd);
              } finally {
                setPending(false);
              }
            }}
          >
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={String(!c.active)} />
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              {c.active ? "Pause" : "Resume"}
            </Button>
          </form>

          <form
            action={async (fd) => {
              if (
                !confirm(
                  `Remove "${c.label}"? Meetings it already imported stay where they are, but nothing new will arrive until you add it again with a fresh API key.`,
                )
              )
                return;
              setPending(true);
              try {
                await deleteConnection(fd);
              } finally {
                setPending(false);
              }
            }}
          >
            <input type="hidden" name="id" value={c.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-3">
        <TagPicker connection={c} />
      </div>

      <div className="mt-3 border-t border-hairline pt-3">
        <Status connection={c} syncMsg={syncMsg} />
      </div>
    </div>
  );
}

/**
 * Which tags mean "file this here". This is the privacy control, not a
 * convenience — the sync passes these to Pocket, so anything not tagged is
 * never requested and never reaches this server.
 */
function TagPicker({ connection: c }: { connection: ConnectionRow }) {
  const [tags, setTags] = useState<PocketTag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(c.tagIds);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function load() {
    startLoad(async () => {
      const r = await fetchTags(c.id);
      if ("error" in r) setError(r.error);
      else {
        setTags(r.tags);
        setError(null);
      }
    });
  }

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id];
    setSelected(next);
    startSave(async () => {
      await setConnectionTags(c.id, next);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Tag className="h-3.5 w-3.5" />
          Tags that come into Clerkr OS
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={load} disabled={loading}>
          {loading ? "Loading..." : tags ? "Reload" : "Choose tags"}
        </Button>
      </div>

      {c.tagIds.length === 0 && (
        <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Nothing is syncing.</strong> Pick at
          least one tag — only recordings carrying it are ever fetched, so anything you record
          for another client stays in Pocket.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {tags && tags.length === 0 && (
        <p className="text-xs text-muted-foreground">
          This account has no tags yet. Make one in Pocket &mdash; call it &ldquo;Clerkr&rdquo;
          &mdash; and tag the recordings that belong here.
        </p>
      )}

      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {t.color && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                    aria-hidden
                  />
                )}
                {t.name ?? t.id}
              </button>
            );
          })}
        </div>
      )}

      {!tags && c.tagIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {c.tagIds.length} tag{c.tagIds.length === 1 ? "" : "s"} selected. &ldquo;Choose
          tags&rdquo; to change them.
        </p>
      )}
    </div>
  );
}

function Status({ connection: c, syncMsg }: { connection: ConnectionRow; syncMsg: string | null }) {
  if (syncMsg) return <p className="text-xs text-foreground">{syncMsg}</p>;

  if (c.lastError) {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{c.lastError}</span>
      </div>
    );
  }

  if (!c.lastEventAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Hasn&rsquo;t run yet. It checks every 10 minutes, or press &ldquo;Check now&rdquo;.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {/* Fixed locale — a per-browser date mismatches on hydration. */}
        Last checked {new Date(c.lastEventAt).toLocaleString("en-US")}
      </span>
      {c.lastEvent && <span>{c.lastEvent}</span>}
      <span>
        {c.meetingsCreated} meeting{c.meetingsCreated === 1 ? "" : "s"} imported
      </span>
    </div>
  );
}
