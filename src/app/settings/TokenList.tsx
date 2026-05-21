"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { revokeToken } from "./actions";

interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function TokenList({ tokens }: { tokens: Token[] }) {
  if (tokens.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No tokens yet. Create one above to connect your Claude client.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary text-xs uppercase tracking-wide text-secondary-foreground">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Token</th>
            <th className="px-4 py-2">Last used</th>
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <TokenRow key={t.id} token={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenRow({ token }: { token: Token }) {
  const [pending, setPending] = useState(false);
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2 font-medium">{token.name}</td>
      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
        {token.tokenPrefix}…
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {token.lastUsedAt
          ? new Date(token.lastUsedAt).toLocaleString()
          : "Never"}
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {new Date(token.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2 text-right">
        <form
          action={async (fd) => {
            if (!confirm(`Revoke token "${token.name}"?`)) return;
            setPending(true);
            try {
              await revokeToken(fd);
            } finally {
              setPending(false);
            }
          }}
        >
          <input type="hidden" name="id" value={token.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {pending ? "Revoking..." : "Revoke"}
          </Button>
        </form>
      </td>
    </tr>
  );
}
