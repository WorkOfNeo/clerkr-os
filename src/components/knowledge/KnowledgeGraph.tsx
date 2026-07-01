"use client";

import Link from "next/link";
import { useState } from "react";

import { STATUS_META, statusLabel, type FeatureStatus } from "@/components/feature/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface KnowledgeEntry {
  id: string;
  slug: string;
  title: string;
  status: FeatureStatus;
  clusterId: string | null;
  requestCount: number;
  sources: { id: string; title: string }[];
}

export interface KnowledgeCluster {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface KnowledgeLink {
  fromId: string;
  toId: string;
  kind: string;
}

export function KnowledgeGraph({
  clusters,
  entries,
  links,
}: {
  clusters: KnowledgeCluster[];
  entries: KnowledgeEntry[];
  links: KnowledgeLink[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const groups = clusters.map((c) => ({
    cluster: c,
    items: entries.filter((e) => e.clusterId === c.id),
  }));
  const unclustered = entries.filter((e) => !e.clusterId);

  const selectedLinks = selected
    ? links.filter((l) => l.fromId === selected.id || l.toId === selected.id)
    : [];

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No entries yet. Promote a meeting signal or add a feature to populate the graph.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-wrap content-start gap-3">
        {groups.map((g) => (
          <ClusterGroup
            key={g.cluster.id}
            label={`${g.cluster.icon ?? "◦"} ${g.cluster.name}`}
            items={g.items}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))}
        {unclustered.length > 0 && (
          <ClusterGroup
            label="◦ Unclustered"
            items={unclustered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>

      <aside className="h-fit rounded-lg border bg-card p-4 lg:sticky lg:top-6">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select an entry to inspect it.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={STATUS_META[selected.status].variant}>
                {statusLabel(selected.status)}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {selected.requestCount} request{selected.requestCount === 1 ? "" : "s"}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug">{selected.title}</h2>
            <p className="text-xs text-muted-foreground">{STATUS_META[selected.status].meaning}</p>

            <div className="border-t pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Source meetings
              </p>
              {selected.sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No linked meetings.</p>
              ) : (
                <ul className="space-y-1">
                  {selected.sources.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/meetings/${s.id}`}
                        className="text-xs underline-offset-2 hover:underline"
                      >
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Connections
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedLinks.length} cross-link{selectedLinks.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="border-t pt-3">
              <Link
                href={`/features/${selected.slug}`}
                className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Open &amp; edit entry
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function ClusterGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  items: KnowledgeEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-w-[220px] flex-1 rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-[11px] text-muted-foreground">No entries</p>}
        {items.map((e) => {
          const meta = STATUS_META[e.status];
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-xs transition hover:border-foreground/40",
                selectedId === e.id && "border-foreground/60 ring-1 ring-foreground/20",
                e.status === "SMALL_UNIQUE" && "border-dashed",
              )}
            >
              <span className="flex-1 truncate font-medium">{e.title}</span>
              <Badge variant={meta.variant} className="shrink-0 px-1.5 py-0 text-[10px]">
                {meta.label}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
