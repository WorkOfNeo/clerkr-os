"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare, X } from "lucide-react";

import {
  ensureSessionForSprint,
  sendChatMessage,
  type ChatTurnResponse,
} from "@/app/chat/actions";
import { cn } from "@/lib/utils";

import { ChatComposer } from "./ChatComposer";
import { ChatMessageList, type ChatMessageItem, type CitedNote } from "./ChatMessageList";

interface Props {
  sprintId: string | null;
  sprintName?: string | null;
  sprintSlug?: string | null;
  focusTaskId?: string | null;
}

export function LlmPanel({ sprintId, sprintName, sprintSlug, focusTaskId }: Props) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [citedNotes, setCitedNotes] = useState<CitedNote[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Hydrate the session when the panel first opens for this sprint.
  useEffect(() => {
    if (!open || sessionId) return;
    let cancelled = false;
    void ensureSessionForSprint({ sprintId })
      .then((res) => {
        if (cancelled || !res) return;
        setSessionId(res.id);
        setMessages(res.messages);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, sprintId, sessionId]);

  function send(text: string) {
    setError(null);
    // Optimistically append the user message.
    const optimistic: ChatMessageItem = {
      id: `local-${Date.now()}`,
      role: "USER",
      content: text,
      citedNoteIds: [],
    };
    setMessages((prev) => [...prev, optimistic]);

    start(async () => {
      const res: ChatTurnResponse = await sendChatMessage({
        sessionId,
        userMessage: text,
        sprintId,
        focusTaskId: focusTaskId ?? null,
      });
      if (!sessionId) setSessionId(res.sessionId);
      setMessages(res.messages);
      // Merge cited notes (don't lose old ones).
      setCitedNotes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        for (const n of res.citedNotes) byId.set(n.id, n);
        return Array.from(byId.values());
      });
      if (res.error) setError(res.error);
    });
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition hover:scale-105"
          aria-label="Open assistant"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      <aside
        className={cn(
          "fixed bottom-0 right-0 top-14 z-40 w-96 transform border-l bg-background shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex h-12 items-center justify-between border-b px-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Assistant</span>
            {sprintName && (
              <span className="text-[10px] text-muted-foreground">{sprintName}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[calc(100%-3rem)] flex-col">
          <div className="flex-1 overflow-y-auto">
            <ChatMessageList
              messages={messages}
              citedNotes={citedNotes}
              sprintSlug={sprintSlug}
              loading={pending}
            />
            {error && (
              <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
          <ChatComposer onSubmit={send} disabled={pending} />
        </div>
      </aside>
    </>
  );
}
