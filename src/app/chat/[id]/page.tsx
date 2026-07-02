import { notFound } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { ChatConversation } from "@/components/llm/ChatConversation";
import { ChatSidebar } from "@/components/llm/ChatSidebar";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [chat, sessions] = await Promise.all([
    db.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    db.chatSession.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    }),
  ]);
  if (!chat) notFound();

  const allCitedIds = Array.from(new Set(chat.messages.flatMap((m) => m.citedNoteIds)));
  const citedNotes = allCitedIds.length
    ? await db.wikiNote.findMany({
        where: { id: { in: allCitedIds } },
        select: { id: true, slug: true, title: true },
      })
    : [];

  return (
    <div className="flex h-screen flex-col">
      <AppNav email={session.user.email} />
      <div className="flex min-h-0 flex-1">
        <ChatSidebar sessions={sessions} activeId={chat.id} />
        <div className="min-w-0 flex-1">
          <ChatConversation
            initialSessionId={chat.id}
            initialMessages={chat.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              citedNoteIds: m.citedNoteIds,
            }))}
            initialCitedNotes={citedNotes}
          />
        </div>
      </div>
    </div>
  );
}
