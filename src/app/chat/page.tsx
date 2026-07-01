import Link from "next/link";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";

export default async function ChatListPage() {
  const session = await requireSession();
  const sessions = await db.chatSession.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      sprint: { select: { name: true, slug: true } },
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Chats</h1>
          <p className="text-sm text-muted-foreground">
            Past assistant sessions — including plan reviews and side-panel conversations.
          </p>
        </div>

        {sessions.length === 0 && (
          <div className="rounded-md border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            No chats yet. Open the side panel on a sprint or task to start one.
          </div>
        )}

        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-md border bg-card p-3">
              <Link href={`/chat/${s.id}`} className="block hover:underline">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="line-clamp-1 text-sm font-medium">{s.title}</h3>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s._count.messages} msgs
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.sprint ? `Sprint: ${s.sprint.name} · ` : ""}
                  {new Date(s.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
