import Link from "next/link";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { SprintCard } from "@/components/sprint/SprintCard";

export default async function SprintsPage() {
  const session = await requireSession();
  const sprints = await db.sprint.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { tasks: true } } },
  });

  const active = sprints.find((s) => s.state === "ACTIVE");
  const planned = sprints.filter((s) => s.state === "PLANNED");
  const closed = sprints.filter((s) => s.state === "CLOSED");

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-4xl space-y-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Sprints</h1>
            <p className="text-sm text-muted-foreground">
              Two-week cycles. First Thursday + week-2 Wed/Fri are testing days.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/sprints/new">New sprint</Link>
          </Button>
        </div>

        {active && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Active</h2>
            <SprintCard sprint={active} active />
          </section>
        )}

        {planned.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Planned</h2>
            <div className="space-y-2">
              {planned.map((s) => (
                <SprintCard key={s.id} sprint={s} />
              ))}
            </div>
          </section>
        )}

        {closed.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Closed</h2>
            <div className="space-y-2">
              {closed.map((s) => (
                <SprintCard key={s.id} sprint={s} />
              ))}
            </div>
          </section>
        )}

        {sprints.length === 0 && (
          <div className="rounded-md border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            No sprints yet.{" "}
            <Link href="/sprints/new" className="underline">
              Create the first one
            </Link>
            .
          </div>
        )}
      </main>
    </div>
  );
}
