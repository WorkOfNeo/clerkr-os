"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";

import { sendChatMessage } from "@/app/chat/actions";
import { cn } from "@/lib/utils";

import type { ChatMessageItem, CitedNote } from "./ChatMessageList";
import { SaveToWikiButton } from "./SaveToWikiButton";

const SUGGESTIONS = [
  "What's currently on the roadmap?",
  "Which feature requests have no roadmap item?",
  "Summarise our most recent meeting brief",
  "Do we already have a feature for bulk redaction?",
];

export function ChatConversation({
  initialSessionId,
  initialMessages,
  initialCitedNotes,
}: {
  initialSessionId: string | null;
  initialMessages: ChatMessageItem[];
  initialCitedNotes: CitedNote[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [citedNotes, setCitedNotes] = useState<CitedNote[]>(initialCitedNotes);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const citedById = new Map(citedNotes.map((n) => [n.id, n]));

  function send(value: string) {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    setText("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, role: "USER", content: trimmed, citedNoteIds: [] },
    ]);
    start(async () => {
      const res = await sendChatMessage({ sessionId, userMessage: trimmed, sprintId: null });
      if (res.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
      if (res.messages.length) setMessages(res.messages);
      setCitedNotes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        for (const n of res.citedNotes) byId.set(n.id, n);
        return Array.from(byId.values());
      });
      if (res.error) setError(res.error);
      router.refresh(); // refresh the session list in the sidebar
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(text);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4">
          {isEmpty && !pending ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-purple-500 text-lg text-primary-foreground shadow-lg">
                ✦
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ask your Product OS anything</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Copilot searches your meetings, features, roadmap and wiki — and cites what it finds.
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-xl border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-6">
              {messages.map((m) =>
                m.role === "USER" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="group flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500 text-xs text-primary-foreground">
                      ✦
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                      {m.citedNoteIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>Sources:</span>
                          {m.citedNoteIds.map((id) => {
                            const n = citedById.get(id);
                            return n ? (
                              <Link
                                key={id}
                                href={`/wiki/${n.slug}`}
                                className="rounded-full border bg-background px-2 py-0.5 hover:bg-accent"
                              >
                                {n.title}
                              </Link>
                            ) : null;
                          })}
                        </div>
                      )}
                      {!m.id.startsWith("local-") && (
                        <div className="opacity-0 transition group-hover:opacity-100">
                          <SaveToWikiButton
                            messageId={m.id}
                            defaultTitle={m.content.slice(0, 60).trim() || "Note"}
                            defaultBody={m.content}
                            defaultTags={[]}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {pending && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500 text-xs text-primary-foreground">
                    ✦
                  </div>
                  <div className="flex items-center gap-1 pt-1.5 text-sm text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {error && (
            <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm focus-within:border-foreground/30">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message Copilot…  (Enter to send, Shift+Enter for newline)"
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => send(text)}
              disabled={pending || !text.trim()}
              aria-label="Send"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition",
                (pending || !text.trim()) && "opacity-40",
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
