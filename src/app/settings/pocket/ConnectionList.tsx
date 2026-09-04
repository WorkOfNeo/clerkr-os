"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deleteConnection, setConnectionActive } from "./actions";

export interface ConnectionRow {
  id: string;
  label: string;
  pocketEmail: string;
  active: boolean;
  defaultKind: string;
  ownerLabel: string;
  lastEventAt: Date | null;
  lastEvent: string | null;
  lastError: string | null;
  deliveries: number;
  meetingsCreated: number;
}

export function ConnectionList({ connections }: { connections: ConnectionRow[] }) {
  if (connections.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No Pocket accounts connected yet. Follow the three steps above.
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
            {c.pocketEmail} &middot; files under {c.ownerLabel} as{" "}
            {c.defaultKind.toLowerCase()}
          </p>
        </div>

        <div className="flex items-center gap-1">
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
                  `Remove "${c.label}"? Meetings it already filed stay where they are, but new recordings will stop arriving until you add it again with a fresh secret from Pocket.`,
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
        <Status connection={c} />
      </div>
    </div>
  );
}

function Status({ connection: c }: { connection: ConnectionRow }) {
  if (c.lastError) {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Last delivery failed
          {c.lastEvent ? ` (${c.lastEvent})` : ""}: {c.lastError}
        </span>
      </div>
    );
  }

  if (!c.lastEventAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing received yet. Send a test from Pocket&rsquo;s webhook settings to
        check the URL and secret.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {/* Fixed locale — a card date rendered per-browser mismatches on hydration. */}
        Last delivery {new Date(c.lastEventAt).toLocaleString("en-US")}
      </span>
      {c.lastEvent && <span>Event: {c.lastEvent}</span>}
      <span>
        {c.deliveries} delivered &middot; {c.meetingsCreated} meeting
        {c.meetingsCreated === 1 ? "" : "s"} created
      </span>
    </div>
  );
}
