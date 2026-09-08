"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, CheckCheck, Sparkles, Undo2, WandSparkles } from "lucide-react";

import { sendChatMessage } from "@/app/chat/actions";
import { acceptProposals, dismissProposals } from "@/app/chat/intake-actions";
import { improvePromptAction } from "@/app/chat/prompt-actions";
import type { ProposalDTO } from "@/lib/intake/dto";
import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { ProposalCard } from "@/components/intake/ProposalCard";
import { MicButton, VoicePanel, useVoiceInput } from "@/components/intake/VoiceInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useIsTouch } from "@/lib/use-is-touch";
import { cn } from "@/lib/utils";

import type { ChatMessageItem, CitedNote } from "@/components/llm/ChatMessageList";
import { SaveToWikiButton } from "@/components/llm/SaveToWikiButton";

/**
 * The front door. One chat, with tools.
 *
 * There used to be two modes — "File it" classified a paste into records,
 * "Ask" answered questions — and picking the wrong one was the common case:
 * asked in Ask mode to add something to a board, the read-only Copilot replied
 * "I can't do that", which was false about the app. The agent behind this now
 * decides for itself whether to search, whether to ask, and whether to propose,
 * so there is nothing left for the user to choose in advance.
 */

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
  const isTouch = useIsTouch();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [citedNotes, setCitedNotes] = useState<CitedNote[]>(initialCitedNotes);
  const [proposals, setProposals] = useState(initialProposals);
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Selection spans the whole transcript, not one message: five bugs pasted in
  // two goes are still one batch of five to approve.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkPending, startBulk] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Improve my prompt" keeps the draft it replaced so Discard can put it
  // back. Cleared on send; a fresh improvement overwrites it, so Discard
  // always restores what was there before the *first* press.
  const [previousText, setPreviousText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [improving, startImprove] = useTransition();

  // Dictation. The transcript is appended to whatever is already in the box
  // rather than replacing it, so a half-typed note can be finished by voice.
  const voice = useVoiceInput({
    onTranscript: (spoken) => {
      setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n${spoken}` : spoken));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, proposals, pending]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const citedById = new Map(citedNotes.map((n) => [n.id, n]));
  const busy = pending || improving || voice.active;

  function improve() {
    const value = text;
    if (!value.trim() || busy) return;
    setError(null);
    startImprove(async () => {
      const res = await improvePromptAction({ text: value, mode: "ask" });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.text.trim() === value.trim()) {
        setNotice("Already reads well — nothing changed.");
        return;
      }
      // Keep the oldest draft: pressing Improve twice then Discard should land
      // on what the person actually typed, not on the first rewrite.
      setPreviousText((prev) => prev ?? value);
      setText(res.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }

  function discardImprovement() {
    if (previousText === null) return;
    setText(previousText);
    setPreviousText(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /** Outstanding across every message — a card already created has nothing
   *  left to approve, and a dismissed one is gone. */
  const outstanding = Object.values(proposals)
    .flat()
    .filter((p) => p.status === "PROPOSED" && !p.createdId);
  const selectedIds = outstanding.filter((p) => selected.has(p.id)).map((p) => p.id);

  function toggleSelected(id: string, next: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  /** Fold the rows a batch returned back into the transcript, so the cards show
   *  what they became without waiting on a server round trip. */
  function applyBatch(updated: ProposalDTO[]) {
    const byId = new Map(updated.map((p) => [p.id, p]));
    setProposals((prev) => {
      const next: Record<string, ProposalDTO[]> = {};
      for (const [messageId, list] of Object.entries(prev)) {
        next[messageId] = list.map((p) => byId.get(p.id) ?? p);
      }
      return next;
    });
  }

  function approveSelected() {
    if (!selectedIds.length || bulkPending) return;
    const ids = selectedIds;
    startBulk(async () => {
      const res = await acceptProposals(ids);
      applyBatch(res.proposals);
      setSelected(new Set());
      if (res.created) {
        toast(`Created ${res.created} ${res.created === 1 ? "record" : "records"}`, {
          tone: "success",
        });
      }
      // One card that can't be created must not read as if the batch failed —
      // the rest of them landed.
      if (res.failed) {
        toast(res.error ?? `${res.failed} couldn't be created`, { tone: "error" });
      }
      router.refresh();
    });
  }

  function dismissSelected() {
    if (!selectedIds.length || bulkPending) return;
    const ids = selectedIds;
    startBulk(async () => {
      const res = await dismissProposals(ids);
      applyBatch(res.proposals);
      setSelected(new Set());
      toast(`Dismissed ${res.dismissed}`);
      router.refresh();
    });
  }

  function submit() {
    const value = text.trim();
    if ((!value && images.length === 0) || busy) return;
    setError(null);
    setPreviousText(null);
    setText("");
    const staged = images;
    setImages([]);

    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, role: "USER", content: value, citedNoteIds: [] },
    ]);

    start(async () => {
      const res = await sendChatMessage({
        sessionId,
        userMessage: value,
        ticketId: null,
        attachments: staged.map((i) => ({
          dataUrl: i.dataUrl,
          fileName: i.fileName,
          ...(i.width ? { width: i.width } : {}),
          ...(i.height ? { height: i.height } : {}),
        })),
      });
      if (res.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
      if (res.messages.length) setMessages(res.messages);
      setCitedNotes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        for (const n of res.citedNotes) byId.set(n.id, n);
        return Array.from(byId.values());
      });
      // A turn comes back with cards whenever the agent decided to propose —
      // which is its call to make, not the user's.
      if (res.proposalMessageId && res.proposals) {
        setProposals((prev) => ({ ...prev, [res.proposalMessageId!]: res.proposals! }));
      }
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                          {(() => {
                            const open = cards.filter(
                              (p) => p.status === "PROPOSED" && !p.createdId,
                            );
                            const allPicked =
                              open.length > 0 && open.every((p) => selected.has(p.id));
                            // Only worth offering once there's more than one —
                            // "select all" over a single card is just a click
                            // with extra steps.
                            return open.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    for (const p of open) {
                                      if (allPicked) next.delete(p.id);
                                      else next.add(p.id);
                                    }
                                    return next;
                                  })
                                }
                                className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {allPicked ? "Clear selection" : `Select all ${open.length}`}
                              </button>
                            ) : null;
                          })()}

                          {cards.map((p) => (
                            // Keyed by status too: a card accepted in a batch
                            // has to remount to pick up what it became.
                            <ProposalCard
                              key={`${p.id}:${p.status}`}
                              proposal={p}
                              selected={selected.has(p.id)}
                              onSelectedChange={(next) => toggleSelected(p.id, next)}
                            />
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
        <div className="mx-auto w-full max-w-3xl space-y-2 px-3 py-3 sm:px-4">
          {/* Approving sits with the composer rather than with the cards: the
              selection spans the transcript, and this is the one place on the
              page that is always in view. */}
          {selectedIds.length > 0 && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 shadow-[0_0_0_1px_hsl(var(--hairline))]"
            >
              <span className="text-[12.5px] text-muted-foreground">
                <strong className="font-medium text-foreground">{selectedIds.length}</strong>{" "}
                selected
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  disabled={bulkPending}
                >
                  Clear
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={dismissSelected}
                  disabled={bulkPending}
                >
                  Dismiss
                </Button>
                <Button size="xs" onClick={approveSelected} disabled={bulkPending}>
                  <CheckCheck className="h-3 w-3" />
                  {bulkPending ? "Creating…" : `Approve ${selectedIds.length}`}
                </Button>
              </div>
            </motion.div>
          )}

          {(error ?? voice.error) && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive ring-1 ring-inset ring-destructive/25">
              {error ?? voice.error}
            </div>
          )}


          {voice.active ? (
            <VoicePanel voice={voice} />
          ) : (
          <ImageDropzone
            images={images}
            onChange={setImages}
            disabled={busy}
            max={20}
            hint="or paste screenshots (⌘V / Ctrl+V), or drag a batch in"
          >
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // On a phone, Return is the newline key — there is a send
                // button right there, and a keyboard whose Return fires off a
                // half-written note is hostile. ⌘/Ctrl+Enter still sends
                // everywhere, including from a tablet keyboard.
                if (isTouch && !e.metaKey && !e.ctrlKey) return;
                // On a real keyboard, Enter sends and Shift+Enter breaks.
                if (e.shiftKey) return;
                e.preventDefault();
                submit();
              }}
              rows={3}
              placeholder={
                isTouch
                  ? "Type anything — a note to file, or a question."
                  : "Type anything — a note to file, or a question. (↵ to send, ⇧↵ for a new line)"
              }
              className={cn(
                "w-full resize-none overflow-y-auto bg-transparent px-3.5 py-3 text-[16px] leading-relaxed outline-none",
                "placeholder:text-muted-foreground/60 sm:px-3 sm:py-2.5 sm:text-[13.5px]",
                // One height, always. It used to grow on hover and again on
                // focus, which moved the send button under the cursor on the
                // way to clicking it and shoved the transcript up the screen
                // every time you reached for the box. Long text scrolls inside
                // instead — taller on a phone, since that's the surface the
                // PWA exists for.
                "h-[104px] sm:h-[92px]",
              )}
            />
          </ImageDropzone>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <MicButton voice={voice} disabled={pending || improving} />
              {previousText !== null ? (
                <button
                  type="button"
                  onClick={discardImprovement}
                  disabled={busy}
                  title="Put the original text back"
                  className={cn(
                    "pressable flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    busy && "opacity-40",
                  )}
                >
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Discard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={improve}
                  disabled={busy || !text.trim()}
                  title="Tidy the draft before sending"
                  className={cn(
                    "pressable flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    (busy || !text.trim()) && "opacity-40",
                  )}
                >
                  <WandSparkles
                    className={cn("h-3.5 w-3.5", improving && "animate-pulse")}
                    strokeWidth={1.75}
                  />
                  {improving ? "Improving…" : "Improve"}
                </button>
              )}
              <p className="hidden min-w-0 truncate text-[11.5px] text-muted-foreground sm:block">
                {notice ?? "Nothing is created until you confirm the card."}
              </p>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy || (!text.trim() && images.length === 0)}
              aria-label="Send"
              className={cn(
                "pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity",
                (busy || (!text.trim() && images.length === 0)) && "opacity-40",
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
