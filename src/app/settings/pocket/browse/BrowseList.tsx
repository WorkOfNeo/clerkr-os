"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

import { importOne } from "../actions";

export interface BrowseRow {
  id: string;
  title: string;
  recordedAt: string | null;
  durationLabel: string | null;
  tags: { id: string; name: string; color: string | null }[];
  imported: boolean;
  meetingId: string | null;
}

export function BrowseList({
  connectionId,
  rows,
}: {
  connectionId: string;
  rows: BrowseRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No recordings in this window.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-border">
      {rows.map((r) => (
        <BrowseItem key={r.id} connectionId={connectionId} row={r} />
      ))}
    </ul>
  );
}

function BrowseItem({ connectionId, row }: { connectionId: string; row: BrowseRow }) {
  const [pending, startImport] = useTransition();
  const [result, setResult] = useState<{ meetingId?: string; error?: string } | null>(null);

  const done = row.imported || Boolean(result?.meetingId);
  const meetingId = result?.meetingId ?? row.meetingId;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {row.recordedAt && <span>{row.recordedAt}</span>}
          {row.durationLabel && <span>{row.durationLabel}</span>}
          {row.tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              {t.color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
              )}
              {t.name}
            </span>
          ))}
        </div>
        {result?.error && <p className="mt-1 text-xs text-destructive">{result.error}</p>}
      </div>

      {done && meetingId ? (
        <Link
          href={`/meetings/${meetingId}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          <Check className="h-3.5 w-3.5" />
          Open meeting
        </Link>
      ) : done ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="h-3.5 w-3.5" />
          Imported
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startImport(async () => {
              const r = await importOne(connectionId, row.id);
              setResult(
                r.error ? { error: r.error } : { meetingId: r.meetingId },
              );
            })
          }
        >
          <Download className="h-3.5 w-3.5" />
          {pending ? "Importing..." : "Import"}
        </Button>
      )}
    </li>
  );
}
