import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createTask } from "../actions";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ sprint?: string }>;
}) {
  const session = await requireSession();
  const { sprint: sprintSlug } = await searchParams;

  const [statuses, groups, stacks, sprints] = await Promise.all([
    db.taskStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskStack.findMany({ orderBy: { sortOrder: "asc" } }),
    db.sprint.findMany({
      where: { state: { not: "CLOSED" } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const preselectedSprint = sprintSlug
    ? sprints.find((s) => s.slug === sprintSlug) ?? null
    : sprints.find((s) => s.state === "ACTIVE") ?? null;

  async function submit(formData: FormData) {
    "use server";
    const { slug } = await createTask(formData);
    redirect(`/tasks/${slug}`);
  }

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-xl space-y-6 py-8">
        <div>
          <h1 className="text-xl font-semibold">New task</h1>
          <p className="text-sm text-muted-foreground">
            You can edit description, blockers, and dates from the task detail page.
          </p>
        </div>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="statusId">Status</Label>
              <select
                id="statusId"
                name="statusId"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={statuses[0]?.id}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                defaultValue="MEDIUM"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprintId">Sprint</Label>
              <select
                id="sprintId"
                name="sprintId"
                defaultValue={preselectedSprint?.id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Backlog</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="groupId">Group</Label>
              <select
                id="groupId"
                name="groupId"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {stacks.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="stackId">Stack</Label>
              <select
                id="stackId"
                name="stackId"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {stacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plannedDate">Planned date</Label>
              <Input id="plannedDate" name="plannedDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="estimatedHours">Estimated hours</Label>
            <Input id="estimatedHours" name="estimatedHours" type="number" step="0.25" min="0" />
          </div>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <a href={preselectedSprint ? `/tasks?sprint=${preselectedSprint.slug}` : "/tasks"}>
                Cancel
              </a>
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
