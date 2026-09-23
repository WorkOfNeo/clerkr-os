import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { CardPageView } from "@/components/kanban/CardPageView";
import { toBoardColumn } from "@/components/kanban/types";
import { db } from "@/lib/db";
import { cardSelect, columnsFor } from "@/lib/kanban";
import { markdownExcerpt } from "@/lib/markdown/convert";
import { requireSession } from "@/lib/session";

// A card as a page of its own — for the cards that are projects, where the
// note is a document and the subtasks are the plan. The side sheet on the
// board is the quick look; this is where the work gets written down.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await db.kanbanCard.findUnique({
    where: { slug },
    select: { number: true, title: true, description: true },
  });
  if (!card) return { title: "Card" };
  return {
    title: `#${card.number} ${card.title}`,
    description: markdownExcerpt(card.description, 160) || `Card #${card.number} on the board.`,
  };
}

export default async function KanbanCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const row = await db.kanbanCard.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      column: { select: { boardId: true, board: { select: { id: true, slug: true, name: true } } } },
    },
  });

  if (!row) {
    // /kanban/cards/14 is what a person types after seeing "#14" on the board.
    if (/^\d+$/.test(slug)) {
      const byNumber = await db.kanbanCard.findUnique({
        where: { number: Number(slug) },
        select: { slug: true },
      });
      if (byNumber) redirect(`/kanban/cards/${byNumber.slug}`);
    }
    notFound();
  }

  const { column, ...card } = row;
  const columns = (await columnsFor(column.boardId)).map(toBoardColumn);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <CardPageView key={card.id} card={card} columns={columns} board={column.board} />
      </main>
    </AppShell>
  );
}
