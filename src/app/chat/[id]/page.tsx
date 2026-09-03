import { notFound } from "next/navigation";

import { getProposalsForSession } from "@/app/chat/intake-actions";
import { AppShell } from "@/components/AppShell";
import { IntakeConversation } from "@/components/intake/IntakeConversation";
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

  const [chat, sessions, proposals] = await Promise.all([
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
    getProposalsForSession(id),
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
    <AppShell email={session.user.email} flush>
      <div className="flex min-h-0 flex-1">
        <ChatSidebar sessions={sessions} activeId={chat.id} />
        <div className="min-w-0 flex-1">
          <IntakeConversation
            initialSessionId={chat.id}
            initialMessages={chat.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              citedNoteIds: m.citedNoteIds,
            }))}
            initialCitedNotes={citedNotes}
            initialProposals={proposals}
          />
        </div>
      </div>
    </AppShell>
  );
}
