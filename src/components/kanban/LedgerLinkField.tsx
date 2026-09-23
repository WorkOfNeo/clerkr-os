"use client";

import { Check, Copy, ExternalLink, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";

import { updateCard } from "@/app/kanban/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/format";
import { parseLedgerShareUrl } from "@/lib/ledger";

import type { BoardCard } from "./types";

/**
 * The card's NEO Ledger plan. Clerkr OS never calls the Ledger — it has no API
 * by design — so this only holds the link. Progress arrives when Claude, with
 * both MCPs connected, reads the plan and runs `sync_card_from_ledger`; the
 * copy button hands you the sentence that asks for exactly that.
 */
export function LedgerLinkField({ card }: { card: BoardCard }) {
  const [editing, setEditing] = useState(!card.ledgerUrl);
  const [value, setValue] = useState(card.ledgerUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const linked = card.subtasks.filter((s) => s.ledgerRef).length;

  function save(next: string | null) {
    if (next !== null && !parseLedgerShareUrl(next)) {
      setError("Paste a share link — https://…/share/<token>, from the plan's Share button.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateCard({ id: card.id, ledgerUrl: next });
        setEditing(next === null);
        if (next === null) setValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that link.");
      }
    });
  }

  function copyPrompt() {
    const prompt =
      `Sync Clerkr OS card #${card.number} from its NEO Ledger plan (${card.ledgerUrl}). ` +
      "Read the plan with get_plan, then call sync_card_from_ledger.";
    void navigator.clipboard
      ?.writeText(prompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast("Couldn't copy", { tone: "error" }));
  }

  if (editing || !card.ledgerUrl) {
    return (
      <div>
        <label htmlFor={`ledger-${card.id}`} className="mb-1.5 block text-[13px] font-medium">
          NEO Ledger plan
        </label>
        <div className="flex gap-2">
          <Input
            id={`ledger-${card.id}`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.trim()) save(value.trim());
              } else if (e.key === "Escape" && card.ledgerUrl) {
                setValue(card.ledgerUrl);
                setEditing(false);
              }
            }}
            placeholder="https://neo-ledger.up.railway.app/share/…"
            className="h-8 text-[13px]"
            inputMode="url"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending || !value.trim()}
            onClick={() => save(value.trim())}
          >
            Link
          </Button>
        </div>
        {error ? (
          <p className="mt-1.5 text-[12px] text-destructive">{error}</p>
        ) : (
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
            Link the project&apos;s plan and Claude can tick these subtasks off as the Ledger
            tasks get done.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium">NEO Ledger plan</span>
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 py-1.5 pl-3 pr-1.5">
        <a
          href={card.ledgerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{new URL(card.ledgerUrl).host}</span>
        </a>
        <IconButton label="Copy the sync request for Claude" onClick={copyPrompt}>
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton label="Change link" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Unlink" onClick={() => save(null)} disabled={isPending}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
        {card.ledgerSyncedAt
          ? `Synced ${formatShortDate(card.ledgerSyncedAt)} · ${linked} of ${card.subtasks.length} subtasks linked to the plan.`
          : "Not synced yet — copy the request and ask Claude in a session with both MCPs connected."}
      </p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="pressable rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}
