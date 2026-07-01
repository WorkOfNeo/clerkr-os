import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { AddRoadmapItem } from "@/components/roadmap/AddRoadmapItem";
import { RoadmapBoard } from "@/components/roadmap/RoadmapBoard";
import { RoadmapTimeline } from "@/components/roadmap/RoadmapTimeline";
import type { RoadmapCardItem } from "@/components/roadmap/types";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;
  const timeline = view === "timeline";

  const [rows, features] = await Promise.all([
    db.roadmapItem.findMany({
      orderBy: [{ lane: "asc" }, { order: "asc" }],
      include: { feature: { select: { id: true, slug: true, title: true } } },
    }),
    db.feature.findMany({
      orderBy: { title: "asc" },
      select: { id: true, slug: true, title: true },
    }),
  ]);

  const items: RoadmapCardItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    lane: r.lane,
    order: r.order,
    confidence: r.confidence,
    themeTag: r.themeTag,
    blocked: r.blocked,
    blockerNote: r.blockerNote,
    featureId: r.featureId,
    feature: r.feature,
  }));

  const tab = "rounded px-3 py-1";
  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Roadmap</h1>
            <p className="text-sm text-muted-foreground">
              Drag cards between lanes — changes auto-save.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5 text-sm">
              <Link
                href="/roadmap"
                className={cn(tab, !timeline ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                Lanes
              </Link>
              <Link
                href="/roadmap?view=timeline"
                className={cn(tab, timeline ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                Timeline
              </Link>
            </div>
            <AddRoadmapItem features={features} />
          </div>
        </div>

        {timeline ? <RoadmapTimeline items={items} /> : <RoadmapBoard items={items} />}
      </main>
    </div>
  );
}
