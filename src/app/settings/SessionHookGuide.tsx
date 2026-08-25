import Link from "next/link";

import { CopyBlock } from "@/components/CopyBlock";

/**
 * Install guide for the Claude Code SessionEnd hook. Shown on /settings next to
 * the MCP connect guide, because both need a token from the same place.
 */
export function SessionHookGuide({ origin }: { origin: string }) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        When a Claude Code session ends in a Clerkr repo, the hook sends the conversation
        here and the AI harvests what&apos;s durable — decisions, dead ends, blockers,
        ideas — into the work log. Sessions with nothing worth keeping are dropped, and
        sessions outside your Clerkr repos never leave your machine. Everything it writes
        lands marked <em>needs review</em> so a guess never quietly becomes fact.
      </p>

      <CopyBlock
        label="Install (from the clerkr-internal repo)"
        mono
        value={`npm run hook:install -- --url ${origin} --token <your-token>`}
      />

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p>
          The installer appends to <code className="font-mono">~/.claude/settings.json</code>{" "}
          and leaves any hooks already registered there alone. Re-running it updates the
          Clerkr entry in place instead of adding a second one.
        </p>
        <p>
          Widen what counts as a Clerkr repo with{" "}
          <code className="font-mono">--repos clerkr,neo-labs</code> — it&apos;s matched
          against the session&apos;s working directory.
        </p>
      </div>

      <CopyBlock label="Watch it work" mono value="tail -f ~/.clerkr-hook.log" />

      <p className="text-xs text-muted-foreground">
        Tune what it keeps in{" "}
        <Link href="/settings/prompts" className="underline">
          AI prompts
        </Link>{" "}
        → &ldquo;Claude session → work log&rdquo;. Ask the Copilot for{" "}
        <code className="font-mono">ingest_history</code> to see what it decided to skip
        and why.
      </p>
    </div>
  );
}
