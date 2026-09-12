"use client";

import { useState } from "react";
import { MailCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestReset } from "./actions";

export function ForgotPasswordForm({
  mode,
  domain,
}: {
  mode: "email" | "direct";
  domain: string;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData();
    form.set("email", email);
    const result = await requestReset(form);

    if (result.kind === "error") {
      setPending(false);
      setError(result.message);
      return;
    }
    // In direct mode the action redirects to the new-password form instead of
    // returning, so reaching here always means a link was emailed.
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-sm font-medium">Check your inbox</p>
          <p className="text-[13px] text-muted-foreground">
            If an account uses that address, a link to set a new password is on
            its way. It works for one hour.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "direct" && (
        <div className="flex gap-2.5 rounded-md bg-amber-500/10 p-3 text-[12.5px] leading-snug text-amber-900 dark:text-amber-200">
          <ShieldAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            No email is configured, so this resets the password on the spot with
            no confirmation. Anyone who knows an @{domain} address can use it
            until <code className="font-mono text-[11.5px]">RESEND_API_KEY</code>{" "}
            is set.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={`you@${domain}`}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-[12px] text-muted-foreground">
          @{domain} addresses only.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? "Working..."
          : mode === "direct"
            ? "Set a new password"
            : "Email me a link"}
      </Button>
    </form>
  );
}
