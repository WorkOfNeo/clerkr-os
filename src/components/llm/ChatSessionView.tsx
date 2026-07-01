"use client";

import { useState, useTransition } from "react";

import { sendChatMessage } from "@/app/chat/actions";

import { ChatComposer } from "./ChatComposer";
import { ChatMessageList, type ChatMessageItem, type CitedNote } from "./ChatMessageList";

interface Props {
  sessionId: string;
  sprintId: string | null;
  sprintSlug: string | null;
  initialMessages: ChatMessageItem[];
  initialCitedNotes: CitedNote[];
}

export function ChatSessionView({
  sessionId,
  sprintId,
  sprintSlug,
  initialMessages,
  initialCitedNotes,
}: Props) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [citedNotes, setCitedNotes] = useState<CitedNote[]>(initialCitedNotes);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(text: string) {
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "USER", content: text, citedNoteIds: [] },
    ]);
    start(async () => {
      const res = await sendChatMessage({
        sessionId,
        userMessage: text,
        sprintId,
      });
      setMessages(res.messages);
      setCitedNotes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        for (const n of res.citedNotes) byId.set(n.id, n);
        return Array.from(byId.values());
      });
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col rounded-md border bg-background min-h-[70vh]">
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
  );
}
