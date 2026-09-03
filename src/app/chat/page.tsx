import { AppShell } from "@/components/AppShell";
import { IntakeConversation } from "@/components/intake/IntakeConversation";
import { ChatSidebar } from "@/components/llm/ChatSidebar";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export default async function ChatPage() {
  const session = await requireSession();
  const sessions = await db.chatSession.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
    take: 50,
  });

  return (
    // `flush`: intake owns its whole viewport — the transcript scrolls and the
    // composer stays pinned, so it can't sit inside the usual padded main.
    <AppShell email={session.user.email} flush>
      <div className="flex min-h-0 flex-1">
        <ChatSidebar sessions={sessions} activeId={null} />
        <div className="min-w-0 flex-1">
          <IntakeConversation
            initialSessionId={null}
            initialMessages={[]}
            initialCitedNotes={[]}
            initialProposals={{}}
          />
        </div>
      </div>
    </AppShell>
  );
}
