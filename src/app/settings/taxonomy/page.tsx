import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { TaxonomyEditor } from "@/components/taxonomy/TaxonomyEditor";

export default async function TaxonomyPage() {
  const session = await requireSession();
  const [statuses, groups, stacks] = await Promise.all([
    db.taskStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taskStack.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-8 py-8">
        <div>
          <h1 className="text-xl font-semibold">Taxonomy</h1>
          <p className="text-sm text-muted-foreground">
            Editable lists used by the sprint board. Add new values as you learn what the team needs.
          </p>
        </div>

        <TaxonomyEditor
          kind="status"
          title="Statuses"
          helperText="Kanban columns. Mark one or more as terminal ('Done') so analytics know what counts as complete."
          rows={statuses}
        />
        <TaxonomyEditor
          kind="group"
          title="Groups"
          helperText="High-level buckets like Development, Marketing, Website."
          rows={groups}
        />
        <TaxonomyEditor
          kind="stack"
          title="Stacks"
          helperText="Tech stack tags — add as patterns emerge."
          rows={stacks}
        />
      </main>
    </div>
  );
}
