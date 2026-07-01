import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { ChatSessionView } from "@/components/llm/ChatSessionView";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const chat = await db.chatSession.findUnique({
    where: { id },
    include: {
      sprint: { select: { id: true, slug: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!chat) notFound();

  // Resolve cited note titles for any assistant message.
  const allCitedIds = Array.from(
    new Set(chat.messages.flatMap((m) => m.citedNoteIds)),
  );
  const citedNotes = allCitedIds.length
    ? await db.wikiNote.findMany({
        where: { id: { in: allCitedIds } },
        select: { id: true, slug: true, title: true },
      })
    : [];

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/chat" className="hover:underline">
              Chats
            </Link>
            <span>/</span>
            <span className="line-clamp-1">{chat.title}</span>
          </div>
          {chat.sprint && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/sprints/${chat.sprint.slug}`}>Sprint: {chat.sprint.name}</Link>
            </Button>
          )}
        </div>

        <ChatSessionView
          sessionId={chat.id}
          sprintId={chat.sprint?.id ?? null}
          sprintSlug={chat.sprint?.slug ?? null}
          initialMessages={chat.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citedNoteIds: m.citedNoteIds,
          }))}
          initialCitedNotes={citedNotes}
        />
      </main>
    </div>
  );
}
