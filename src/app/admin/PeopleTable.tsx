"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Shield, ShieldOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/format";

import { mintResetLink, setUserRole } from "./actions";

export interface AdminPerson {
  id: string;
  email: string;
  name: string;
  role: "MEMBER" | "SUPERADMIN";
  createdAt: string;
  sessions: number;
}

export function PeopleTable({
  people,
  currentUserId,
  mode,
}: {
  people: AdminPerson[];
  currentUserId: string;
  mode: "email" | "direct";
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The minted link is held here rather than in a toast: it has to stay on
  // screen long enough to be copied and pasted into a message.
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function changeRole(person: AdminPerson, role: "MEMBER" | "SUPERADMIN") {
    setBusyId(person.id);
    startTransition(async () => {
      const form = new FormData();
      form.set("userId", person.id);
      form.set("role", role);
      const result = await setUserRole(form);
      setBusyId(null);
      toast(result.message, { tone: result.ok ? "success" : "error" });
    });
  }

  function issueLink(person: AdminPerson) {
    setBusyId(person.id);
    startTransition(async () => {
      const form = new FormData();
      form.set("userId", person.id);
      const result = await mintResetLink(form);
      setBusyId(null);
      if (!result.ok) {
        toast(result.message, { tone: "error" });
        return;
      }
      setCopied(false);
      setLink({ email: person.email, url: result.url });
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      toast("Couldn't reach the clipboard — select the link and copy it.", {
        tone: "error",
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="surface divide-y divide-hairline overflow-hidden">
        {people.map((person) => {
          const isSelf = person.id === currentUserId;
          const isSuper = person.role === "SUPERADMIN";
          const busy = pending && busyId === person.id;

          return (
            <div
              key={person.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold uppercase text-primary-foreground">
                {(person.name || person.email).slice(0, 1)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">
                  {person.name || person.email}
                  {isSelf && (
                    <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {person.email} · joined {formatShortDate(person.createdAt)} ·{" "}
                  {person.sessions === 1 ? "1 session" : `${person.sessions} sessions`}
                </p>
              </div>

              <Badge variant={isSuper ? "default" : "secondary"} className="shrink-0">
                {isSuper ? "Superadmin" : "Member"}
              </Badge>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => issueLink(person)}
                  title="Create a one-hour link this person can use to set a new password"
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  Reset link
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => changeRole(person, isSuper ? "MEMBER" : "SUPERADMIN")}
                >
                  {isSuper ? (
                    <>
                      <ShieldOff className="mr-1 h-3.5 w-3.5" />
                      Demote
                    </>
                  ) : (
                    <>
                      <Shield className="mr-1 h-3.5 w-3.5" />
                      Promote
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {link && (
        <div className="surface space-y-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium">Reset link for {link.email}</p>
            <button
              onClick={() => setLink(null)}
              className="text-[12px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Good for one hour and usable once. Send it to them — they choose the
            password, you never see it.
            {mode === "email" && " A copy has also gone to their inbox."}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-2 font-mono text-[11.5px]">
              {link.url}
            </code>
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
