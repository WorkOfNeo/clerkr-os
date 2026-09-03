"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { sendChatMessage } from "@/app/chat/actions";
import { submitIntake } from "@/app/chat/intake-actions";
import type { ProposalDTO } from "@/lib/intake/dto";
import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { ProposalCard } from "@/components/intake/ProposalCard";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

import type { ChatMessageItem, CitedNote } from "@/components/llm/ChatMessageList";
import { SaveToWikiButton } from "@/components/llm/SaveToWikiButton";

/**
 * The front door.
 *
 * Two modes on one surface, because they're the same gesture with different
 * intent: FILE turns a paste into records, ASK answers a question about what
 * already exists. Splitting them into two pages would mean choosing before you
 * know which one you need.
 */
type Mode = "file" | "ask";

const FILE_EXAMPLES = [
  "Paste raw meeting notes — attendees, what was said, what was decided",
  "Dump a list of bugs, one per line",
  "Describe an idea and let it work out where it belongs",
];

export function IntakeConversation({
  initialSessionId,
  initialMessages,
  initialCitedNotes,
  initialProposals,
}: {
  initialSessionId: string | null;
  initialMessages: ChatMessageItem[];
  initialCitedNotes: CitedNote[];
  initialProposals: Record<string, ProposalDTO[]>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("file");
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [citedNotes, setCitedNotes] = useState<CitedNote[]>(initialCitedNotes);
  const [proposals, setProposals] = useState(initialProposals);
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, proposals, pending]);

  const citedById = new Map(citedNotes.map((n) => [n.id, n]));

  function submit() {
    const value = text.trim();
    if ((!value && images.length === 0) || pending) return;
    setError(null);
    setText("");
    const staged = images;
    setImages([]);

    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, role: "USER", content: value, citedNoteIds: [] },
    ]);

    start(async () => {
      if (mode === "file") {
        const res = await submitIntake({
          sessionId,
          text: value,
          attachments: staged.map((i) => ({
            dataUrl: i.dataUrl,
            fileName: i.fileName,
            ...(i.width ? { width: i.width } : {}),
            ...(i.height ? { height: i.height } : {}),
          })),
        });
        if (res.error) setError(res.error);
        if (res.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
        if (res.messageId) {
          setMessages((prev) => [
            ...prev,
            { id: res.messageId!, role: "ASSISTANT", content: res.reply, citedNoteIds: [] },
          ]);
          setProposals((prev) => ({ ...prev, [res.messageId!]: res.proposals }));
        }
      } else {
        const res = await sendChatMessage({ sessionId, userMessage: value, ticketId: null });
        if (res.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
        if (res.messages.length) setMessages(res.messages);
        setCitedNotes((prev) => {
          const byId = new Map(prev.map((n) => [n.id, n]));
          for (const n of res.citedNotes) byId.set(n.id, n);
          return Array.from(byId.values());
        });
        if (res.error) setError(res.error);
      }
      router.refresh();
    });
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4">
          {isEmpty && !pending ? (
            <div className="flex min-h-[58vh] flex-col items-center justify-center gap-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background">
                <Sparkles className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="max-w-md">
                <h2 className="text-[19px] font-semibold tracking-[-0.02em]">
                  Type anything. It works out what it is.
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                  Paste raw notes and they come back as tickets, board cards, meetings or wiki
                  notes — proposed as cards you confirm. Nothing is filed until you say so.
                </p>
              </div>
              <ul className="space-y-1.5 text-[13px] text-muted-foreground/80">
                {FILE_EXAMPLES.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-5 py-6">
              {messages.map((m) => {
                const cards = proposals[m.id] ?? [];
                return m.role === "USER" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-[13.5px] leading-relaxed text-background">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="group flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Sparkles className="h-3 w-3" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {m.content && (
                        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
                          {m.content}
                        </div>
                      )}

                      {cards.length > 0 && (
                        <div className="space-y-2">
                          {cards.map((p) => (
                            <ProposalCard key={p.id} proposal={p} />
                          ))}
                        </div>
                      )}

                      {m.citedNoteIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>Sources:</span>
                          {m.citedNoteIds.map((id) => {
                            const n = citedById.get(id);
                            return n ? (
                              <Link
                                key={id}
                                href={`/wiki/${n.slug}`}
                                className="rounded-full bg-card px-2 py-0.5 ring-1 ring-hairline hover:bg-muted"
                              >
                                {n.title}
                              </Link>
                            ) : null;
                          })}
                        </div>
                      )}

                      {!m.id.startsWith("local-") && cards.length === 0 && m.content && (
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
                );
              })}

              {pending && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Sparkles className="h-3 w-3" strokeWidth={2} />
                  </div>
                  <motion.div
                    className="flex items-center gap-1 pt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </motion.div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-hairline bg-background/80 pb-safe backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive ring-1 ring-inset ring-destructive/25">
              {error}
            </div>
          )}

          <Segmented
            layoutId="intake-mode"
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            segments={[
              { value: "file", label: "File it" },
              { value: "ask", label: "Ask" },
            ]}
          />

          <ImageDropzone
            images={images}
            onChange={setImages}
            disabled={pending}
            max={20}
            hint="or paste screenshots (⌘V / Ctrl+V), or drag a batch in"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
              // Taller on a phone: this is the surface the PWA exists for, and a
              // three-line box makes pasting notes feel like a scratch pad
              // rather than a search field.
              onFocus={(e) => e.currentTarget.setAttribute("rows", "6")}
              onBlur={(e) => e.currentTarget.setAttribute("rows", "3")}
              placeholder={
                mode === "file"
                  ? "Paste your notes… (⌘↵ to send)"
                  : "Ask about tickets, features, meetings or the wiki… (⌘↵ to send)"
              }
              className="max-h-[45vh] min-h-[64px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 sm:min-h-0 sm:text-[13.5px]"
            />
          </ImageDropzone>

          <div className="flex items-center justify-between">
            <p className="text-[11.5px] text-muted-foreground">
              {mode === "file"
                ? "Proposals only — nothing is created until you confirm each card."
                : "Answers from your meetings, features, board and wiki."}
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={pending || (!text.trim() && images.length === 0)}
              aria-label="Send"
              className={cn(
                "pressable flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background transition-opacity",
                (pending || (!text.trim() && images.length === 0)) && "opacity-40",
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
