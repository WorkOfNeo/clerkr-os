import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatRange } from "@/lib/format";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewPlanButton } from "@/components/sprint/ReviewPlanButton";
import { SprintCloseDialog } from "@/components/sprint/SprintCloseDialog";
import { SprintTimeline } from "@/components/sprint/SprintTimeline";
import { LlmPanel } from "@/components/llm/LlmPanel";

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const sprint = await db.sprint.findUnique({
    where: { slug },
    include: {
      tasks: {
        where: { archivedAt: null },
        include: {
          status: true,
          assignees: { include: { user: { select: { id: true, email: true, name: true } } } },
        },
        orderBy: [{ statusId: "asc" }, { order: "asc" }],
      },
    },
  });

  if (!sprint) notFound();

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container space-y-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/sprints" className="text-xs text-muted-foreground hover:underline">
                Sprints
              </Link>
              <span className="text-xs text-muted-foreground">/</span>
              <h1 className="text-xl font-semibold">{sprint.name}</h1>
              <Badge variant={sprint.state === "ACTIVE" ? "default" : "secondary"}>
                {sprint.state.toLowerCase()}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatRange(sprint.startDate, sprint.endDate)}
              {sprint.planningDate &&
                ` · planned ${new Date(sprint.planningDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`}
            </p>
            {sprint.goal && <p className="mt-2 max-w-2xl text-sm">{sprint.goal}</p>}
          </div>
          <div className="flex items-center gap-2">
            <ReviewPlanButton sprintId={sprint.id} />
            <Button asChild size="sm" variant="outline">
              <Link href={`/tasks?sprint=${sprint.slug}`}>Open kanban</Link>
            </Button>
            {sprint.state !== "CLOSED" && (
              <SprintCloseDialog
                sprintId={sprint.id}
                sprintSlug={sprint.slug}
                sprintName={sprint.name}
              />
            )}
          </div>
        </div>

        <SprintTimeline sprint={sprint} tasks={sprint.tasks} />

        {sprint.retroNotes && (
          <section className="rounded-md border bg-card p-4">
            <h3 className="text-sm font-semibold">Retro notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {sprint.retroNotes}
            </p>
          </section>
        )}
      </main>
      <LlmPanel sprintId={sprint.id} sprintName={sprint.name} sprintSlug={sprint.slug} />
    </div>
  );
}
