"use client";

import { useActionState } from "react";

import { CopyBlock } from "@/components/CopyBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createToken, type CreateTokenState } from "./actions";

const initial: CreateTokenState = { status: "idle" };

export function CreateTokenForm({ origin }: { origin: string }) {
  const [state, formAction, pending] = useActionState(createToken, initial);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="token-name">New token name</Label>
          <Input
            id="token-name"
            name="name"
            placeholder="e.g. Niels — Claude Code"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create token"}
        </Button>
      </form>

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {state.status === "success" && (
        <TokenReveal raw={state.raw} name={state.name} origin={origin} />
      )}
    </div>
  );
}

function TokenReveal({
  raw,
  name,
  origin,
}: {
  raw: string;
  name: string;
  origin: string;
}) {
  const claudeAiUrl = `${origin}/api/mcp/${raw}`;
  const claudeCodeCmd = `claude mcp add --transport http --scope user clerkr-ideas \\\n  ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${raw}"`;

  return (
    <div className="space-y-4 rounded-lg border-2 border-foreground/30 bg-foreground/[0.04] p-4">
      <div>
        <p className="text-sm font-medium">Token &ldquo;{name}&rdquo; created.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The raw token is shown <strong>once</strong>. Copy what you need now;
          if you lose it, revoke this token and create a new one.
        </p>
      </div>

      <CopyBlock label="Raw token" value={raw} mono />

      <div className="space-y-1.5">
        <Label className="text-xs">Connector URL (Claude.ai web — paste this)</Label>
        <CopyBlock value={claudeAiUrl} mono />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Claude Code CLI command</Label>
        <CopyBlock value={claudeCodeCmd} mono />
      </div>
    </div>
  );
}
