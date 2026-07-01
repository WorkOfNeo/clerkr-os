import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { STATUS_META, type FeatureStatus } from "@/components/feature/status";
import { KnowledgeGraph, type KnowledgeEntry } from "@/components/knowledge/KnowledgeGraph";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;
  const list = view === "list";

  const [clusters, features, links] = await Promise.all([
    db.cluster.findMany({ orderBy: { name: "asc" } }),
    db.feature.findMany({
      orderBy: { title: "asc" },
      include: {
        cluster: { select: { id: true, name: true } },
        signals: { select: { meeting: { select: { id: true, title: true } } } },
        _count: { select: { signals: true } },
      },
    }),
    db.featureLink.findMany({ select: { fromId: true, toId: true, kind: true } }),
  ]);

  const entries: KnowledgeEntry[] = features.map((f) => {
    const seen = new Map<string, { id: string; title: string }>();
    for (const s of f.signals) seen.set(s.meeting.id, { id: s.meeting.id, title: s.meeting.title });
    return {
      id: f.id,
      slug: f.slug,
      title: f.title,
      status: f.status as FeatureStatus,
      clusterId: f.clusterId,
      requestCount: f._count.signals,
      sources: [...seen.values()],
    };
  });

  const tab = "rounded px-3 py-1";
  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Knowledge</h1>
            <p className="text-sm text-muted-foreground">
              Your living wiki — every entry, clustered. See and control single records.
            </p>
          </div>
          <div className="inline-flex rounded-md border p-0.5 text-sm">
            <Link
              href="/knowledge"
              className={cn(tab, !list ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              Cluster map
            </Link>
            <Link
              href="/knowledge?view=list"
              className={cn(tab, list ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              All entries
            </Link>
          </div>
        </div>

        {list ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Entry</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Cluster</th>
                  <th className="px-3 py-2 font-medium">Requests</th>
                  <th className="px-3 py-2 font-medium">Sources</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No entries yet.
                    </td>
                  </tr>
                ) : (
                  features.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/features/${f.slug}`} className="hover:underline">
                          {f.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={STATUS_META[f.status as FeatureStatus].variant}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {STATUS_META[f.status as FeatureStatus].label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{f.cluster?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f._count.signals}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entries.find((e) => e.id === f.id)?.sources.length ?? 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <KnowledgeGraph
            clusters={clusters.map((c) => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
              color: c.color,
            }))}
            entries={entries}
            links={links}
          />
        )}
      </main>
    </div>
  );
}
