"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveConnection, type SaveConnectionState } from "./actions";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md bg-card px-3 text-[14px] shadow-xs ring-1 ring-inset ring-input focus:outline-none focus:ring-2 focus:ring-primary/70";

const initial: SaveConnectionState = { status: "idle" };

export interface UserOption {
  id: string;
  email: string;
  name: string;
}

export function ConnectionForm({
  users,
  currentUserId,
}: {
  users: UserOption[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(saveConnection, initial);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pocket-label">Name</Label>
          <Input
            id="pocket-label"
            name="label"
            placeholder="e.g. Niels' Pocket"
            required
          />
          <p className="text-xs text-muted-foreground">Only shown on this page.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pocket-email">Pocket account email</Label>
          <Input
            id="pocket-email"
            name="pocketEmail"
            type="email"
            placeholder="you@neo-labs.com"
            required
          />
          <p className="text-xs text-muted-foreground">
            The account the recordings belong to.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="pocket-key">API key</Label>
        <Input
          id="pocket-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder="pk_…"
          required
        />
        <p className="text-xs text-muted-foreground">
          Created in Pocket under Settings &rarr; API keys. Checked against
          Pocket when you save, so a bad key is caught here rather than as a
          silent empty sync later. Saving the same email again replaces the
          key, which is how you rotate.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pocket-user">File meetings under</Label>
          <select
            id="pocket-user"
            name="userId"
            defaultValue={currentUserId}
            className={SELECT_CLASS}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name?.trim() ? `${u.name} — ${u.email}` : u.email}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pocket-kind">Default meeting type</Label>
          <select
            id="pocket-kind"
            name="defaultKind"
            defaultValue="INTERNAL"
            className={SELECT_CLASS}
          >
            <option value="INTERNAL">Internal</option>
            <option value="CUSTOMER">Customer</option>
            <option value="PROSPECT">Prospect</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save connection"}
        </Button>
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "saved" && (
          <p className="text-sm text-muted-foreground">
            {state.rotated
              ? `Updated “${state.label}”. New key is live.`
              : `“${state.label}” connected. Now choose its tags below — until you do, nothing syncs.`}
          </p>
        )}
      </div>
    </form>
  );
}
