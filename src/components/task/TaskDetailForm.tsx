"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteTask, updateTask } from "@/app/tasks/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipTapEditor } from "@/components/editor/TipTapEditor";

import { AssigneePicker } from "./AssigneePicker";
import { BlockerPicker } from "./BlockerPicker";

interface UserRow {
  id: string;
  email: string;
  name: string;
}

interface TaxonomyRow {
  id: string;
  label: string;
}

interface BlockerCandidate {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  task: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    statusId: string;
    groupId: string | null;
    stackId: string | null;
    sprintId: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate: string | null;
    plannedDate: string | null;
    estimatedHours: number | null;
    loggedHours: number | null;
    assignees: { user: UserRow }[];
    blockedBy: { blocker: BlockerCandidate }[];
  };
  statuses: TaxonomyRow[];
  groups: TaxonomyRow[];
  stacks: TaxonomyRow[];
  sprints: { id: string; name: string }[];
  users: UserRow[];
  blockerCandidates: BlockerCandidate[];
}

export function TaskDetailForm({
  task,
  statuses,
  groups,
  stacks,
  sprints,
  users,
  blockerCandidates,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [description, setDescription] = useState(task.description ?? "");

  function save(formData: FormData) {
    formData.set("id", task.id);
    formData.set("description", description);
    start(async () => {
      await updateTask(formData);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete "${task.name}"? This cannot be undone.`)) return;
    start(async () => {
      await deleteTask(task.id);
    });
  }

  return (
    <form
      action={save}
      className="grid gap-6 lg:grid-cols-[1fr_280px]"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={task.name} required />
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <TipTapEditor initialContent={task.description ?? undefined} onChange={setDescription} />
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="statusId">Status</Label>
          <select
            id="statusId"
            name="statusId"
            defaultValue={task.statusId}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            defaultValue={task.priority}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sprintId">Sprint</Label>
          <select
            id="sprintId"
            name="sprintId"
            defaultValue={task.sprintId ?? ""}
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
            defaultValue={task.groupId ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        {stacks.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="stackId">Stack</Label>
            <select
              id="stackId"
              name="stackId"
              defaultValue={task.stackId ?? ""}
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

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="plannedDate">Planned</Label>
            <Input
              id="plannedDate"
              name="plannedDate"
              type="date"
              defaultValue={task.plannedDate ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due</Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="estimatedHours">Est hrs</Label>
            <Input
              id="estimatedHours"
              name="estimatedHours"
              type="number"
              step="0.25"
              min="0"
              defaultValue={task.estimatedHours ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loggedHours">Logged</Label>
            <Input
              id="loggedHours"
              name="loggedHours"
              type="number"
              step="0.25"
              min="0"
              defaultValue={task.loggedHours ?? ""}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Assignees</Label>
          <div className="rounded-md border bg-card p-2 space-y-1.5">
            {task.assignees.length === 0 && (
              <p className="text-xs text-muted-foreground">No one assigned.</p>
            )}
            {task.assignees.map((a) => (
              <div key={a.user.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback>
                      {(a.user.name || a.user.email).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{a.user.email}</span>
                </div>
                <AssigneePicker taskId={task.id} mode="remove" email={a.user.email} />
              </div>
            ))}
            <AssigneePicker taskId={task.id} mode="add" users={users.filter((u) => !task.assignees.some((a) => a.user.id === u.id))} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Blocked by</Label>
          <BlockerPicker
            taskId={task.id}
            blockers={task.blockedBy.map((b) => b.blocker)}
            candidates={blockerCandidates}
          />
        </div>
      </aside>
    </form>
  );
}
