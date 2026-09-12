"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setNewPassword } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here rather than server-side: the server never sees the second
    // field, and a typo shouldn't cost a round trip or burn the token.
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setPending(true);
    const form = new FormData();
    form.set("token", token);
    form.set("password", password);
    const result = await setNewPassword(form);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-sm font-medium">Password changed</p>
          <p className="text-[13px] text-muted-foreground">
            Every device that was signed in has been signed out.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push("/signin")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-[12px] text-muted-foreground">At least 12 characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error ? (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          <Link
            href="/forgot-password"
            className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
          >
            Start over
          </Link>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Set password"}
      </Button>
    </form>
  );
}
