"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { acceptAllForMeeting, dismissAllForMeeting } from "@/app/chat/intake-actions";
import { ProposalCard } from "@/components/intake/ProposalCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ProposalDTO } from "@/lib/intake/dto";

// What the AI found in the transcript, waiting for a person. Same card as the
// /chat intake desk — accepting one is the moment it becomes a decision, a
// feature in the library, an action item or an open question.

const GROUPS: { kind: string; title: string }[] = [
  { kind: "DECISION", title: "Decisions" },
  { kind: "FEATURE", title: "Feature ideas" },
  { kind: "ACTION_ITEM", title: "Action items" },
  { kind: "OPEN_QUESTION", title: "Open questions" },
];

export function MeetingProposals({
  meetingId,
  proposals,
}: {
  meetingId: string;
  proposals: ProposalDTO[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  // Cards keep their own accepted/dismissed state; this is only for the
  // header, so "Accept all" disappears as soon as nothing is left.
  const [remaining, setRemaining] = useState(proposals.length);

  const pending = proposals.filter((p) => p.status === "PROPOSED");
  if (pending.length === 0) return null;

  const refresh = () => {
    setRemaining((n) => Math.max(0, n - 1));
    router.refresh();
  };

  function acceptAll() {
    startTransition(async () => {
      const res = await acceptAllForMeeting(meetingId);
      if (res.failed) {
        toast(`${res.created} accepted, ${res.failed} failed`, { tone: "error" });
      } else {
        toast(`Accepted ${res.created} item${res.created === 1 ? "" : "s"}`, { tone: "success" });
      }
      setRemaining(0);
      router.refresh();
    });
  }

  function dismissAll() {
    startTransition(async () => {
      await dismissAllForMeeting(meetingId);
      setRemaining(0);
      router.refresh();
    });
  }

  const byKind = new Map<string, ProposalDTO[]>();
  for (const p of pending) {
    (byKind.get(p.kind) ?? byKind.set(p.kind, []).get(p.kind)!).push(p);
  }
  // Anything of an unexpected kind still shows, after the known groups.
  const groups = [
    ...GROUPS.filter((g) => byKind.has(g.kind)),
    ...[...byKind.keys()]
      .filter((k) => !GROUPS.some((g) => g.kind === k))
      .map((kind) => ({ kind, title: kind })),
  ];

  return (
    <section className="surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
          Proposed from this meeting
          <span className="text-xs font-normal text-muted-foreground">{remaining}</span>
        </h2>
        {remaining > 0 && (
          <div className="flex items-center gap-1.5">
            <Button size="xs" onClick={acceptAll} disabled={isPending}>
              {isPending ? "Working…" : "Accept all"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={dismissAll}
              disabled={isPending}
            >
              Dismiss all
            </Button>
          </div>
        )}
      </div>
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        Nothing here is filed yet. Accept a card to make it real, edit it first if the wording is
        off, or dismiss it and it won&rsquo;t be proposed again.
      </p>

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.kind}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {g.title}
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                {byKind.get(g.kind)!.length}
              </span>
            </h3>
            <div className="space-y-2">
              {byKind.get(g.kind)!.map((p) => (
                <ProposalCard key={p.id} proposal={p} onChange={refresh} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
