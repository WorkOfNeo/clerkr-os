"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { SaveToWikiButton } from "./SaveToWikiButton";

export interface ChatMessageItem {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citedNoteIds: string[];
}

export interface CitedNote {
  id: string;
  slug: string;
  title: string;
}

interface Props {
  messages: ChatMessageItem[];
  citedNotes: CitedNote[];
  sprintSlug?: string | null;
  loading?: boolean;
  emptyState?: string;
}

export function ChatMessageList({ messages, citedNotes, sprintSlug, loading, emptyState }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="px-4 py-12 text-center text-xs text-muted-foreground">
        {emptyState ?? "Ask the assistant anything about this sprint."}
      </div>
    );
  }

  const citedById = new Map(citedNotes.map((n) => [n.id, n]));

  return (
    <div className="space-y-3 px-3 py-2">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            "rounded-md border bg-card p-2.5 text-sm",
            m.role === "USER" && "ml-6 bg-accent/40",
            m.role === "ASSISTANT" && "mr-6",
          )}
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {m.role === "USER" ? "you" : m.role === "ASSISTANT" ? "assistant" : "system"}
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>

          {m.role === "ASSISTANT" && m.citedNoteIds.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>cites:</span>
              {m.citedNoteIds.map((id) => {
                const n = citedById.get(id);
                return n ? (
                  <Link
                    key={id}
                    href={`/wiki/${n.slug}`}
                    className="rounded-full border bg-background px-1.5 py-0.5 hover:bg-accent"
                  >
                    {n.title}
                  </Link>
                ) : null;
              })}
            </div>
          )}

          {m.role === "ASSISTANT" && (
            <div className="mt-2 flex justify-end">
              <SaveToWikiButton
                messageId={m.id}
                defaultTitle={m.content.slice(0, 60).trim() || "Note"}
                defaultBody={m.content}
                defaultTags={sprintSlug ? [`sprint-${sprintSlug}`] : []}
              />
            </div>
          )}
        </div>
      ))}
      {loading && (
        <div className="mr-6 rounded-md border bg-card p-2.5 text-sm text-muted-foreground">
          Thinking…
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
