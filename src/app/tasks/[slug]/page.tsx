import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatISODate } from "@/lib/format";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { TaskDetailForm } from "@/components/task/TaskDetailForm";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const [task, statuses, groups, stacks, sprints, users, blockerCandidates] = await Promise.all([
    db.task.findUnique({
      where: { slug },
      include: {
        assignees: { include: { user: { select: { id: true, email: true, name: true } } } },
        blockedBy: { include: { blocker: { select: { id: true, slug: true, name: true } } } },
      },
    }),
    db.taskStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskStack.findMany({ orderBy: { sortOrder: "asc" } }),
    db.sprint.findMany({
      where: { state: { not: "CLOSED" } },
      orderBy: { startDate: "asc" },
    }),
    db.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: "asc" } }),
    db.task.findMany({
      where: { slug: { not: slug }, archivedAt: null },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  if (!task) notFound();

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-5xl space-y-6 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/tasks" className="hover:underline">
            Tasks
          </Link>
          <span>/</span>
          <span>{task.slug}</span>
        </div>

        <TaskDetailForm
          task={{
            id: task.id,
            slug: task.slug,
            name: task.name,
            description: task.description,
            statusId: task.statusId,
            groupId: task.groupId,
            stackId: task.stackId,
            sprintId: task.sprintId,
            priority: task.priority,
            dueDate: formatISODate(task.dueDate),
            plannedDate: formatISODate(task.plannedDate),
            estimatedHours: task.estimatedHours ? Number(task.estimatedHours) : null,
            loggedHours: task.loggedHours ? Number(task.loggedHours) : null,
            assignees: task.assignees.map((a) => ({ user: a.user })),
            blockedBy: task.blockedBy.map((b) => ({ blocker: b.blocker })),
          }}
          statuses={statuses.map((s) => ({ id: s.id, label: s.label }))}
          groups={groups.map((g) => ({ id: g.id, label: g.label }))}
          stacks={stacks.map((s) => ({ id: s.id, label: s.label }))}
          sprints={sprints.map((s) => ({ id: s.id, name: s.name }))}
          users={users}
          blockerCandidates={blockerCandidates}
        />
      </main>
    </div>
  );
}
