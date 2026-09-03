import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { BoardCard, BoardColumn } from "@/components/kanban/types";
import { db } from "@/lib/db";
import { cardSelect, ensureColumns } from "@/lib/kanban";
import { requireSession } from "@/lib/session";

// The board. Columns are rows, so the workflow on screen is whatever the team
// decided it is — see schema.prisma's KanbanColumn note.

export default async function KanbanPage() {
  const session = await requireSession();

  const [columnRows, cardRows] = await Promise.all([
    ensureColumns(),
    db.kanbanCard.findMany({ orderBy: { order: "asc" }, select: cardSelect }),
  ]);

  const columns: BoardColumn[] = columnRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isDone: c.isDone,
    isDefault: c.isDefault,
    wipLimit: c.wipLimit,
  }));

  const cards: BoardCard[] = cardRows.map((c) => ({ ...c }));

  const done = cards.filter((c) => c.completedAt).length;
  const open = cards.length - done;

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-none px-6 py-8">
        <PageHeader
          title="Kanban"
          subtitle={
            cards.length === 0
              ? "Nothing on the board yet — add a card, or rename the columns to match how you actually work."
              : `${open} in flight · ${done} done · ${columns.length} columns`
          }
        />

        <KanbanBoard columns={columns} cards={cards} />
      </main>
    </AppShell>
  );
}
