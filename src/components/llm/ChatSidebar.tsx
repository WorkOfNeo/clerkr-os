import Link from "next/link";
import { Plus } from "lucide-react";

import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChatSidebarSession {
  id: string;
  title: string;
  updatedAt: Date;
}

export function ChatSidebar({
  sessions,
  activeId,
}: {
  sessions: ChatSidebarSession[];
  activeId: string | null;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/20 md:flex">
      <div className="p-3">
        <Link
          href="/chat"
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition hover:border-foreground/30",
            activeId === null && "border-foreground/30",
          )}
        >
          <Plus className="h-4 w-4" />
          New chat
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No chats yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/chat/${s.id}`}
                  className={cn(
                    "block rounded-lg px-3 py-2 transition hover:bg-accent",
                    s.id === activeId && "bg-accent",
                  )}
                >
                  <div className="line-clamp-1 text-sm">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatShortDate(s.updatedAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
