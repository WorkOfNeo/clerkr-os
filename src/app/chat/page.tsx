import { AppNav } from "@/components/AppNav";
import { ChatConversation } from "@/components/llm/ChatConversation";
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
    <div className="flex h-screen flex-col">
      <AppNav email={session.user.email} />
      <div className="flex min-h-0 flex-1">
        <ChatSidebar sessions={sessions} activeId={null} />
        <div className="min-w-0 flex-1">
          <ChatConversation initialSessionId={null} initialMessages={[]} initialCitedNotes={[]} />
        </div>
      </div>
    </div>
  );
}
