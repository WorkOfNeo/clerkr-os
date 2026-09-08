"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquare, RefreshCw, Send, Trash2 } from "lucide-react";

import { MarkdownView } from "@/components/wiki/MarkdownView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  askAboutMeeting,
  clearMeetingChatAction,
  refetchFromPocket,
} from "@/app/meetings/actions";

// Summary, transcript and questions, as three tabs on the meeting.
//
// The summary and the transcript are separate records of the same
// conversation, and the summary is the lossy one. Putting them side by side
// and adding somewhere to ask is the answer to "the summary got that wrong" —
// the evidence never left, it was just further down the page.

export interface MeetingMessageDTO {
  id: string;
  role: string;
  content: string;
}

type Tab = "summary" | "transcript" | "ask";

export function MeetingSource({
  meetingId,
  summary,
  transcript,
  messages,
  fromPocket,
}: {
  meetingId: string;
  summary: string | null;
  transcript: string;
  messages: MeetingMessageDTO[];
  fromPocket: boolean;
}) {
  const [tab, setTab] = useState<Tab>(summary ? "summary" : "transcript");

  const tabs: { id: Tab; label: string; hint?: string }[] = [
    { id: "summary", label: "Summary" },
    {
      id: "transcript",
      label: "Transcript",
      hint: transcript ? `${transcript.length.toLocaleString("en-US")} chars` : "none",
    },
    { id: "ask", label: "Ask", hint: messages.length ? String(messages.length / 2) : undefined },
  ];

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === t.id
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.hint && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">{t.hint}</span>
              )}
            </button>
          ))}
        </div>
        {fromPocket && <RefetchButton meetingId={meetingId} />}
      </div>

      <div className="p-4">
        {tab === "summary" &&
          (summary ? (
            <MarkdownView body={summary} />
          ) : (
            <Empty>
              No summary for this meeting. The transcript is on the next tab.
            </Empty>
          ))}

        {tab === "transcript" &&
          (transcript ? (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
              {transcript}
            </pre>
          ) : (
            <Empty>
              No transcript stored.{" "}
              {fromPocket
                ? "Press Refresh from Pocket — meetings imported before the transcript fix kept only the summary."
                : "This meeting was created from notes rather than a recording."}
            </Empty>
          ))}

        {tab === "ask" && (
          <AskPanel meetingId={meetingId} messages={messages} hasText={Boolean(transcript || summary)} />
        )}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function RefetchButton({ meetingId }: { meetingId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refetchFromPocket(meetingId);
            setMsg(r.error ?? r.ok ?? null);
          })
        }
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Refreshing..." : "Refresh from Pocket"}
      </Button>
    </div>
  );
}

const SUGGESTIONS = [
  "What did we agree to do, step by step?",
  "What was decided, and what was left open?",
  "Who committed to what?",
];

function AskPanel({
  meetingId,
  messages,
  hasText,
}: {
  meetingId: string;
  messages: MeetingMessageDTO[];
  hasText: boolean;
}) {
  const [thread, setThread] = useState(messages);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    // Show the question immediately; the server persists both sides only once
    // an answer exists, so a failure leaves nothing dangling in the database.
    const optimistic = { id: `tmp-${Date.now()}`, role: "user", content: q };
    setThread((t) => [...t, optimistic]);
    setQuestion("");

    start(async () => {
      const r = await askAboutMeeting(meetingId, q);
      if (r.error) {
        setError(r.error);
        setThread((t) => t.filter((m) => m.id !== optimistic.id));
        setQuestion(q);
        return;
      }
      setThread((t) => [
        ...t,
        { id: `tmp-a-${Date.now()}`, role: "assistant", content: r.answer ?? "" },
      ]);
    });
  }

  if (!hasText) {
    return <Empty>Nothing to read yet — this meeting has no transcript or summary.</Empty>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Answered from this meeting&rsquo;s own transcript and summary, nothing else. When the
        summary got something wrong, ask here &mdash; the transcript still has it.
      </p>

      {thread.length > 0 && (
        <div className="space-y-3">
          {thread.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm"
                  : "max-w-full text-sm"
              }
            >
              {m.role === "assistant" ? (
                <MarkdownView body={m.content} />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          ))}
          {pending && <p className="text-sm text-muted-foreground">Reading the transcript…</p>}
        </div>
      )}

      {thread.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              disabled={pending}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-end gap-2">
        <Textarea
          ref={boxRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a newline — matches the composer
            // elsewhere in the app.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          placeholder="Ask about this meeting…"
          rows={2}
          className="min-h-0 flex-1 resize-none"
          disabled={pending}
        />
        <Button type="button" size="sm" onClick={() => ask(question)} disabled={pending || !question.trim()}>
          <Send className="h-3.5 w-3.5" />
          Ask
        </Button>
      </div>

      {thread.length > 0 && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            Kept with this meeting, and deleted with it.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() =>
              start(async () => {
                await clearMeetingChatAction(meetingId);
                setThread([]);
              })
            }
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
