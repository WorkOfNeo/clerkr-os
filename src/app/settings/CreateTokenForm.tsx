"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

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
  const claudeCodeCmd = `claude mcp add --transport http --scope user clerkr-internal \\\n  ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${raw}"`;
  const claudeAiUrl = `${origin}/api/mcp/${raw}`;

  return (
    <div className="space-y-4 rounded-lg border border-foreground/20 bg-foreground/[0.03] p-4">
      <div>
        <p className="text-sm font-medium">Token &ldquo;{name}&rdquo; created.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This is shown <strong>once</strong> — copy it now. If you lose it, revoke
          it and create a new one.
        </p>
      </div>

      <CopyBlock label="Raw token" value={raw} mono />

      <CopyBlock label="Claude Code (header auth)" value={claudeCodeCmd} mono />

      <CopyBlock label="Claude.ai web (URL auth)" value={claudeAiUrl} mono />
    </div>
  );
}

function CopyBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          className="h-6 gap-1.5 px-2 text-xs"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={`overflow-x-auto rounded border border-border bg-background p-2 text-xs ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
