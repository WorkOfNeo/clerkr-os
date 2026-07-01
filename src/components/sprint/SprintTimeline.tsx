"use client";

import Link from "next/link";

import { formatShortDate } from "@/lib/format";

interface TaskLite {
  id: string;
  slug: string;
  name: string;
  plannedDate: Date | string | null;
  dueDate: Date | string | null;
  status: { label: string; color: string; isDone: boolean };
  assignees: { user: { email: string; name: string } }[];
}

interface Props {
  sprint: {
    startDate: Date | string;
    endDate: Date | string;
    testingDay1: Date | string | null;
    testingDay2: Date | string | null;
    testingDay3: Date | string | null;
  };
  tasks: TaskLite[];
}

function dayIndex(start: Date, d: Date): number {
  const a = new Date(start);
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function SprintTimeline({ sprint, tasks }: Props) {
  const start = new Date(sprint.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(sprint.endDate);
  end.setHours(0, 0, 0, 0);
  const totalDays = Math.max(1, dayIndex(start, end) + 1);

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    return d;
  });

  const testingDayIdx = [sprint.testingDay1, sprint.testingDay2, sprint.testingDay3]
    .filter((d): d is Date | string => d != null)
    .map((d) => dayIndex(start, new Date(d)))
    .filter((i) => i >= 0 && i < totalDays);

  const tasksWithDates = tasks.filter((t) => t.plannedDate || t.dueDate);
  const tasksWithoutDates = tasks.filter((t) => !t.plannedDate && !t.dueDate);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border bg-card">
        <div
          className="grid min-w-[800px]"
          style={{ gridTemplateColumns: `220px repeat(${totalDays}, minmax(40px, 1fr))` }}
        >
          {/* Header */}
          <div className="border-b border-r px-3 py-2 text-xs font-medium text-muted-foreground">
            Task
          </div>
          {days.map((d, i) => (
            <div
              key={i}
              className={`border-b px-1 py-2 text-center text-[10px] ${
                testingDayIdx.includes(i)
                  ? "bg-amber-100 font-semibold text-amber-900"
                  : "text-muted-foreground"
              }`}
              title={testingDayIdx.includes(i) ? "Testing day" : ""}
            >
              <div>{d.toLocaleDateString("en-US", { weekday: "narrow" })}</div>
              <div>{d.getDate()}</div>
            </div>
          ))}

          {/* Rows */}
          {tasksWithDates.length === 0 && (
            <div
              className="col-span-full px-3 py-4 text-center text-xs text-muted-foreground"
              style={{ gridColumn: `1 / -1` }}
            >
              No tasks scheduled. Set plannedDate or dueDate on a task to see it here.
            </div>
          )}

          {tasksWithDates.map((task) => {
            const planned = task.plannedDate ? new Date(task.plannedDate) : null;
            const due = task.dueDate ? new Date(task.dueDate) : null;
            const startIdx = Math.max(0, dayIndex(start, planned ?? due!));
            const endIdx = Math.min(totalDays - 1, dayIndex(start, due ?? planned!));
            const span = Math.max(1, endIdx - startIdx + 1);

            return (
              <div key={task.id} className="contents">
                <Link
                  href={`/tasks/${task.slug}`}
                  className="border-b border-r px-3 py-2 text-xs hover:bg-accent"
                >
                  <div className="line-clamp-1 font-medium">{task.name}</div>
                  <div className="line-clamp-1 text-[10px] text-muted-foreground">
                    {task.assignees.map((a) => a.user.email.split("@")[0]).join(", ") || "—"}
                  </div>
                </Link>
                <div className="relative col-span-full border-b" style={{ gridColumn: `2 / -1` }}>
                  <div
                    className="absolute inset-y-1 rounded-md px-2 text-[10px] font-medium text-white shadow"
                    style={{
                      left: `${(startIdx / totalDays) * 100}%`,
                      width: `${(span / totalDays) * 100}%`,
                      backgroundColor: task.status.color,
                      opacity: task.status.isDone ? 0.5 : 0.95,
                    }}
                    title={`${task.status.label}: ${formatShortDate(planned)} → ${formatShortDate(due)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tasksWithoutDates.length > 0 && (
        <div className="rounded-md border bg-card p-3">
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">No dates set</h4>
          <ul className="space-y-1 text-sm">
            {tasksWithoutDates.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.slug}`} className="hover:underline">
                  {t.name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">{t.status.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
