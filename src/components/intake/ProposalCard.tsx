"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  KanbanSquare,
  Lightbulb,
  MessageSquarePlus,
  Pencil,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  acceptProposalAction,
  dismissProposalAction,
  updateProposalAction,
} from "@/app/chat/intake-actions";
import type { ProposalDTO } from "@/lib/intake/dto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** What each kind IS, in the user's words — the card has to be readable at a
 *  glance or confirming ten of them is worse than typing them by hand. */
const KIND_META: Record<string, { label: string; Icon: LucideIcon; tint: string }> = {
  TICKET: { label: "Ticket", Icon: Ticket, tint: "text-blue-600 bg-blue-500/10" },
  KANBAN_CARD: { label: "Board card", Icon: KanbanSquare, tint: "text-orange-600 bg-orange-500/10" },
  WIKI_NOTE: { label: "Wiki note", Icon: FileText, tint: "text-emerald-600 bg-emerald-500/10" },
  MEETING: { label: "Meeting", Icon: Users, tint: "text-violet-600 bg-violet-500/10" },
  FEATURE: { label: "Feature", Icon: Lightbulb, tint: "text-amber-600 bg-amber-500/10" },
  COMMENT: { label: "Comment", Icon: MessageSquarePlus, tint: "text-sky-600 bg-sky-500/10" },
};

export function ProposalCard({ proposal }: { proposal: ProposalDTO }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState(proposal);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body ?? "");
  const [created, setCreated] = useState<{ label: string; href: string } | null>(
    proposal.createdId ? { label: proposal.title, href: hrefFor(proposal) } : null,
  );

  const meta = KIND_META[state.kind] ?? KIND_META.TICKET;
  const dismissed = state.status === "DISMISSED";

  function accept() {
    startTransition(async () => {
      const res = await acceptProposalAction(state.id);
      if ("error" in res) {
        toast(res.error, { tone: "error" });
        return;
      }
      setCreated(res);
      setState((s) => ({ ...s, status: "ACCEPTED" }));
      toast(`Created ${res.label}`, { tone: "success" });
    });
  }

  function dismiss() {
    startTransition(async () => {
      await dismissProposalAction(state.id);
      setState((s) => ({ ...s, status: "DISMISSED" }));
    });
  }

  function saveEdit() {
    startTransition(async () => {
      const next = await updateProposalAction({ id: state.id, title, body: body || null });
      setState(next);
      setEditing(false);
    });
  }

  if (dismissed) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground/70">
        <X className="h-3.5 w-3.5 shrink-0" />
        <span className="line-through">{state.title}</span>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      className={cn(
        "rounded-xl bg-card p-3 shadow-[0_0_0_1px_hsl(var(--hairline)),0_1px_2px_rgb(0_0_0/0.04)]",
        created && "bg-success/[0.04] shadow-[0_0_0_1px_hsl(var(--success)/0.3)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.tint)}>
          <meta.Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {meta.label}
            </span>
            {state.payload.priority ? (
              <span className="text-[11px] text-muted-foreground">
                {String(state.payload.priority).toLowerCase()}
              </span>
            ) : null}
            {state.payload.column ? (
              <span className="text-[11px] text-muted-foreground">
                → {String(state.payload.column)}
              </span>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="text-[13px]"
              />
              <div className="flex gap-2">
                <Button size="xs" onClick={saveEdit} disabled={isPending}>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-[13.5px] font-medium leading-snug">{state.title}</p>
              {state.body && (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                  {state.body}
                </p>
              )}
            </>
          )}

          {/* The duplicate warning is the point of matching — surfacing it after
              the fact would be too late to be useful. */}
          {state.likelyDuplicate && state.matchTitle && !created && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-[12px] text-warning">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Looks like <strong className="font-medium">{state.matchTitle}</strong> (
                {Math.round((state.matchScore ?? 0) * 100)}% match). Consider commenting on that
                instead.
              </span>
            </div>
          )}

          {created ? (
            <Link
              href={created.href}
              className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success hover:underline"
            >
              <Check className="h-3.5 w-3.5" />
              {created.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            !editing && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <Button size="xs" onClick={accept} disabled={isPending}>
                  {isPending ? "Creating…" : "Create"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={dismiss}
                  disabled={isPending}
                >
                  Dismiss
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}

function hrefFor(p: ProposalDTO): string {
  switch (p.createdType) {
    case "kanban_card":
      return "/kanban";
    case "meeting":
      return `/meetings/${p.createdId}`;
    case "feature":
      return "/features";
    default:
      return "/tickets";
  }
}
