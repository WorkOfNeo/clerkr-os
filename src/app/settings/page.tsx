import { headers } from "next/headers";

import { listApiTokens } from "@/lib/api-tokens";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";

import { CreateTokenForm } from "./CreateTokenForm";
import { TokenList } from "./TokenList";

async function deriveOrigin() {
  const fromEnv = process.env.BETTER_AUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export default async function SettingsPage() {
  const session = await requireSession();
  const [tokens, origin] = await Promise.all([
    listApiTokens(session.user.id),
    deriveOrigin(),
  ]);

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-8 py-8">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Personal API tokens for the MCP server. Each token is tied to your
            account and identifies your posts on the board.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Create a new token</h2>
          <CreateTokenForm origin={origin} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Active tokens</h2>
          <TokenList tokens={tokens} />
        </section>

        <section className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <h2 className="font-medium">How the MCP server works</h2>
          <p className="text-muted-foreground">
            The MCP exposes <strong>full CRUD</strong> over posts:{" "}
            <code className="font-mono text-xs">create_post</code>,{" "}
            <code className="font-mono text-xs">list_posts</code>,{" "}
            <code className="font-mono text-xs">get_post</code>,{" "}
            <code className="font-mono text-xs">update_post</code>,{" "}
            <code className="font-mono text-xs">delete_post</code>,{" "}
            <code className="font-mono text-xs">search_posts</code>. Use Claude
            to scrape a URL and add it to the board — the server&apos;s
            instructions describe what fields to fill.
          </p>
        </section>
      </main>
    </div>
  );
}
