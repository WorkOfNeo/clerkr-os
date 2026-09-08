import type { Metadata } from "next";

import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { db } from "@/lib/db";
import { listRecordings, PocketApiError } from "@/lib/pocket/client";
import { requireSession } from "@/lib/session";

import { BrowseList, type BrowseRow } from "./BrowseList";

export const metadata: Metadata = {
  title: "Browse Pocket recordings",
  description: "Import a recording you didn't tag. Listing fetches no transcripts.",
};

// Listing is metadata only — Pocket returns `transcript` and `summarizations`
// as null here. So this page can show every recording on the account by title
// without moving a word of any conversation; the transcript is fetched only
// when someone presses Import on one of them.

const LOOKBACK_DAYS = 30;

function durationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export default async function BrowsePocketPage() {
  const session = await requireSession();

  const connection = await db.pocketConnection.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, apiKey: true },
  });

  let rows: BrowseRow[] = [];
  let error: string | null = null;

  if (connection) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    try {
      const recordings = await listRecordings(connection.apiKey, {
        startDate: since,
        limit: 100,
      });

      const imported = await db.meeting.findMany({
        where: { pocketRecordingId: { in: recordings.map((r) => r.id) } },
        select: { id: true, pocketRecordingId: true },
      });
      const byRecording = new Map(imported.map((m) => [m.pocketRecordingId, m.id]));

      rows = recordings.map((r) => {
        const when = r.recording_at ?? r.recordingAt ?? r.created_at ?? r.createdAt ?? null;
        return {
          id: r.id,
          title: r.title?.trim() || "Untitled recording",
          // Fixed locale — a per-browser date mismatches on hydration.
          recordedAt: when ? new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
          durationLabel: durationLabel(r.duration),
          tags: (r.tags ?? []).map((t) => ({
            id: t.id,
            name: t.name ?? t.id,
            color: t.color ?? null,
          })),
          imported: byRecording.has(r.id),
          meetingId: byRecording.get(r.id) ?? null,
        };
      });
    } catch (err) {
      error = err instanceof PocketApiError ? err.message : "Could not reach Pocket.";
    }
  }

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span>/</span>
          <Link href="/settings/pocket" className="hover:underline">
            Pocket
          </Link>
          <span>/</span>
          <span>Browse</span>
        </div>

        <div>
          <h1 className="text-display text-[28px] font-semibold leading-tight">
            Browse recordings
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Everything on the account from the last {LOOKBACK_DAYS} days, tagged or not &mdash;
            for importing one you forgot to tag.{" "}
            <strong className="text-foreground">
              This list carries no transcripts.
            </strong>{" "}
            Pocket sends the text of a recording only when you press Import on it.
          </p>
        </div>

        {!connection ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No active Pocket connection.{" "}
            <Link href="/settings/pocket" className="text-foreground underline">
              Connect one first →
            </Link>
          </p>
        ) : error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Reading {connection.label}.
            </p>
            <BrowseList connectionId={connection.id} rows={rows} />
          </>
        )}
      </main>
    </AppShell>
  );
}
