import type { Metadata } from "next";

import { myKanbanPrefs } from "@/app/kanban/actions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { BoardBar, type BoardOption } from "@/components/kanban/BoardBar";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { BoardCard, BoardColumn } from "@/components/kanban/types";
import { db } from "@/lib/db";
import { cardSelect, columnsFor, ensureBoards } from "@/lib/kanban";
import { requireSession } from "@/lib/session";

// Several boards, each its own workflow with its own columns — see the
// KanbanBoard note in schema.prisma.

export const metadata: Metadata = {
  title: "Kanban",
  description:
    "Boards with columns you define yourself, including which ones count as done.",
};

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const [boardRows, me, prefs] = await Promise.all([
    ensureBoards(),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { defaultBoardId: true },
    }),
    myKanbanPrefs(),
  ]);

  // Preference order: the URL, then this person's own default, then the
  // workspace default, then whatever exists. An unknown ?board= falls through
  // rather than 404ing — a stale bookmark should still land somewhere useful.
  const active =
    boardRows.find((b) => b.slug === params.board) ??
    boardRows.find((b) => b.id === me?.defaultBoardId) ??
    boardRows.find((b) => b.isDefault) ??
    boardRows[0];

  const [columnRows, cardRows] = await Promise.all([
    columnsFor(active.id),
    db.kanbanCard.findMany({
      where: { column: { boardId: active.id } },
      orderBy: { order: "asc" },
      select: cardSelect,
    }),
  ]);

  const boards: BoardOption[] = boardRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    isDefault: b.isDefault,
    columnCount: b._count.columns,
  }));

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
          title={active.name}
          subtitle={
            active.description ??
            (cards.length === 0
              ? "Nothing on this board yet — add a card, or rename the columns to match how you actually work."
              : `${open} in flight · ${done} done · ${columns.length} columns`)
          }
        />

        <BoardBar
          boards={boards}
          activeSlug={active.slug}
          myDefaultBoardId={me?.defaultBoardId ?? null}
        />

        <KanbanBoard
          boardId={active.id}
          boardName={active.name}
          isMyDefault={me?.defaultBoardId === active.id}
          notifySubscribed={prefs.notifySubscribedCards}
          subscribedCardIds={prefs.subscribedCardIds}
          columns={columns}
          cards={cards}
        />
      </main>
    </AppShell>
  );
}
