import Link from "next/link";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { SprintSwitcher } from "@/components/kanban/SprintSwitcher";
import { LlmPanel } from "@/components/llm/LlmPanel";

import type { KanbanTask } from "@/components/kanban/types";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sprint?: string }>;
}) {
  const session = await requireSession();
  const { sprint: sprintSlugParam } = await searchParams;

  const [statuses, sprints, activeSprint] = await Promise.all([
    db.taskStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.sprint.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, slug: true, name: true, state: true },
    }),
    db.sprint.findFirst({ where: { state: "ACTIVE" }, orderBy: { startDate: "desc" } }),
  ]);

  // If no sprint param, default to active sprint (if any). Use sprintSlugParam = "backlog" to force null.
  let scopedSprint: { id: string; slug: string; name: string } | null = null;
  if (sprintSlugParam === "backlog") {
    scopedSprint = null;
  } else if (sprintSlugParam) {
    scopedSprint = await db.sprint.findUnique({
      where: { slug: sprintSlugParam },
      select: { id: true, slug: true, name: true },
    });
  } else if (activeSprint) {
    scopedSprint = { id: activeSprint.id, slug: activeSprint.slug, name: activeSprint.name };
  }

  const tasksRaw = await db.task.findMany({
    where: {
      archivedAt: null,
      sprintId: scopedSprint?.id ?? null,
    },
    include: {
      status: true,
      group: { select: { label: true, color: true } },
      stack: { select: { label: true, color: true } },
      assignees: { include: { user: { select: { id: true, email: true, name: true } } } },
      blockedBy: { include: { blocker: { select: { id: true, slug: true, name: true } } } },
    },
    orderBy: [{ statusId: "asc" }, { order: "asc" }],
  });

  const tasks: KanbanTask[] = tasksRaw.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    priority: t.priority,
    order: t.order,
    statusId: t.statusId,
    sprintId: t.sprintId,
    dueDate: t.dueDate,
    estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
    loggedHours: t.loggedHours ? Number(t.loggedHours) : null,
    assignees: t.assignees.map((a) => ({ user: a.user })),
    blockedBy: t.blockedBy.map((b) => ({ blocker: b.blocker })),
    group: t.group,
    stack: t.stack,
  }));

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {scopedSprint ? scopedSprint.name : "Backlog"}
            </h1>
            <SprintSwitcher sprints={sprints} currentSlug={scopedSprint?.slug ?? null} />
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/tasks/new${scopedSprint ? `?sprint=${scopedSprint.slug}` : ""}`}
              >
                New task
              </Link>
            </Button>
            {scopedSprint && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/sprints/${scopedSprint.slug}`}>Sprint view</Link>
              </Button>
            )}
          </div>
        </div>

        <KanbanBoard
          statuses={statuses.map((s) => ({
            id: s.id,
            label: s.label,
            color: s.color,
            isDone: s.isDone,
          }))}
          tasks={tasks}
          sprintId={scopedSprint?.id ?? null}
        />
      </main>
      <LlmPanel
        sprintId={scopedSprint?.id ?? null}
        sprintName={scopedSprint?.name ?? null}
        sprintSlug={scopedSprint?.slug ?? null}
      />
    </div>
  );
}
