import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { ClusterAssignControl } from "@/components/feature/ClusterAssignControl";
import { FeatureDeleteButton } from "@/components/feature/FeatureDeleteButton";
import { FeatureForm } from "@/components/feature/FeatureForm";
import { FeatureStatusControl } from "@/components/feature/FeatureStatusControl";
import { STATUS_META, type FeatureStatus } from "@/components/feature/status";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const feature = await db.feature.findUnique({
    where: { slug },
    include: {
      cluster: true,
      signals: {
        include: { meeting: { select: { id: true, title: true, meetingDate: true, kind: true } } },
        orderBy: { createdAt: "desc" },
      },
      roadmapItems: true,
      linksFrom: { include: { to: { select: { id: true, slug: true, title: true, status: true } } } },
      linksTo: { include: { from: { select: { id: true, slug: true, title: true, status: true } } } },
    },
  });
  if (!feature) notFound();

  const clusters = await db.cluster.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const status = feature.status as FeatureStatus;
  const crossLinks = [
    ...feature.linksFrom.map((l) => ({ id: l.id, feature: l.to, kind: l.kind })),
    ...feature.linksTo.map((l) => ({ id: l.id, feature: l.from, kind: l.kind })),
  ];

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-6 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/features" className="hover:underline">
            Features
          </Link>
          <span>/</span>
          <span className="truncate">{feature.title}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{feature.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{STATUS_META[status].meaning}</p>
          </div>
          <div className="flex items-center gap-2">
            <FeatureForm
              clusters={clusters}
              feature={{
                id: feature.id,
                title: feature.title,
                description: feature.description,
                status,
                tags: feature.tags,
                clusterId: feature.clusterId,
              }}
              triggerVariant="outline"
              triggerLabel="Edit"
            />
            <FeatureDeleteButton
              featureId={feature.id}
              featureTitle={feature.title}
              redirectTo="/features"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <FeatureStatusControl featureId={feature.id} status={status} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cluster
            </p>
            <ClusterAssignControl
              featureId={feature.id}
              clusterId={feature.clusterId}
              clusters={clusters}
            />
          </div>
          {feature.tags.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {feature.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {feature.description && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {feature.description}
            </p>
          </section>
        )}

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Source signals
            <span className="text-xs font-normal text-muted-foreground">
              {feature.signals.length}
            </span>
          </h2>
          {feature.signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meeting signals linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {feature.signals.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm">{s.title}</p>
                    {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
                  </div>
                  <Link
                    href={`/meetings/${s.meeting.id}`}
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {s.meeting.title} · {formatShortDate(s.meeting.meetingDate)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {feature.roadmapItems.length > 0 && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">On the roadmap</h2>
            <ul className="space-y-1">
              {feature.roadmapItems.map((r) => (
                <li key={r.id} className="text-sm">
                  {r.title}
                  <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px]">
                    {r.lane}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {crossLinks.length > 0 && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Connected features</h2>
            <ul className="space-y-1">
              {crossLinks.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {l.kind === "DEPENDS_ON" ? "depends on" : "related"}
                  </Badge>
                  <Link href={`/features/${l.feature.slug}`} className="hover:underline">
                    {l.feature.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
