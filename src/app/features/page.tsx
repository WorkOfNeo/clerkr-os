import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { ClusterForm } from "@/components/feature/ClusterForm";
import { FeatureForm } from "@/components/feature/FeatureForm";
import { STATUS_META, type FeatureStatus } from "@/components/feature/status";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface FeatureRow {
  id: string;
  slug: string;
  title: string;
  status: FeatureStatus;
  tags: string[];
  clusterId: string | null;
  cluster: { id: string; name: string } | null;
  _count: { signals: number; roadmapItems: number };
}

export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;
  const catalog = view === "catalog";

  const [clusters, features] = await Promise.all([
    db.cluster.findMany({ orderBy: { name: "asc" } }),
    db.feature.findMany({
      orderBy: { title: "asc" },
      include: {
        cluster: { select: { id: true, name: true } },
        _count: { select: { signals: true, roadmapItems: true } },
      },
    }),
  ]);
  const clusterOptions = clusters.map((c) => ({ id: c.id, name: c.name }));
  const unclustered = features.filter((f) => !f.clusterId);

  const tab = "rounded px-3 py-1";
  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-5xl py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Feature Library</h1>
            <p className="text-sm text-muted-foreground">
              Self-growing, clustered catalog of every feature signal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5 text-sm">
              <Link
                href="/features"
                className={cn(tab, !catalog ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                Clusters
              </Link>
              <Link
                href="/features?view=catalog"
                className={cn(tab, catalog ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                Catalog
              </Link>
            </div>
            <ClusterForm />
            <FeatureForm clusters={clusterOptions} />
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(STATUS_META).map(([k, m]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <Badge variant={m.variant} className="px-1.5 py-0 text-[10px]">
                {m.label}
              </Badge>
              {m.meaning}
            </span>
          ))}
        </div>

        {features.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No features yet. Add one, or promote a signal from a{" "}
            <Link href="/meetings" className="underline">
              meeting brief
            </Link>
            .
          </div>
        ) : catalog ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <FeatureCard key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {clusters.map((c) => (
              <ClusterBlock
                key={c.id}
                title={`${c.icon ?? "◦"} ${c.name}`}
                description={c.description}
                items={features.filter((f) => f.clusterId === c.id)}
              />
            ))}
            {unclustered.length > 0 && (
              <ClusterBlock title="◦ Unclustered" description={null} items={unclustered} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ClusterBlock({
  title,
  description,
  items,
}: {
  title: string;
  description: string | null;
  items: FeatureRow[];
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {description && <p className="mb-3 text-xs text-muted-foreground">{description}</p>}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No features in this cluster yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((f) => (
            <FeatureCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </section>
  );
}

function FeatureCard({ f }: { f: FeatureRow }) {
  const meta = STATUS_META[f.status];
  return (
    <Link
      href={`/features/${f.slug}`}
      className={cn(
        "block rounded-md border bg-card p-3 transition hover:border-foreground/30",
        f.status === "SMALL_UNIQUE" && "border-dashed",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{f.title}</span>
        <Badge variant={meta.variant} className="shrink-0">
          {meta.label}
        </Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {f.cluster && <span>{f.cluster.name}</span>}
        <span>
          {f._count.signals} request{f._count.signals === 1 ? "" : "s"}
        </span>
        {f.tags.length > 0 && <span>{f.tags.map((t) => `#${t}`).join(" ")}</span>}
      </div>
    </Link>
  );
}
