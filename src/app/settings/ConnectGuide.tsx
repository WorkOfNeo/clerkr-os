"use client";

import { useState } from "react";

import { CopyBlock } from "@/components/CopyBlock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "web" | "code";

export function ConnectGuide({ origin }: { origin: string }) {
  const [tab, setTab] = useState<Tab>("web");

  const placeholder = "<paste your token here>";
  const connectorUrl = `${origin}/api/mcp/${placeholder}`;
  const claudeCodeCmd = `claude mcp add --transport http --scope user clerkr-ideas \\\n  ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${placeholder}"`;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
        <TabButton active={tab === "web"} onClick={() => setTab("web")}>
          Claude.ai (web)
        </TabButton>
        <TabButton active={tab === "code"} onClick={() => setTab("code")}>
          Claude Code (CLI)
        </TabButton>
      </div>

      {tab === "web" ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">
            Connect via Claude.ai &mdash; paste a URL, no config file
          </p>
          <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Open <strong>Claude.ai</strong> &rarr; profile menu &rarr; <strong>Settings</strong>.</li>
            <li>
              Navigate to <strong>Connectors</strong> &rarr; <strong>Add custom connector</strong>.
            </li>
            <li>
              <strong>Name:</strong> <code className="font-mono text-xs">Clerkr Ideas</code>.
            </li>
            <li>
              <strong>Remote MCP server URL:</strong> paste the URL below (replace{" "}
              <code className="font-mono text-xs">{placeholder}</code> with the raw
              token from above):
            </li>
          </ol>
          <CopyBlock value={connectorUrl} mono />
          <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground" start={5}>
            <li>Skip <strong>Advanced settings</strong> entirely.</li>
            <li>Click <strong>Add</strong>. Claude.ai will probe the URL and register the 6 tools.</li>
            <li>
              In a chat, the connector should appear under <strong>Tools</strong>. The skill (below) will route saves through it automatically.
            </li>
          </ol>
          <p className="rounded bg-secondary/60 p-3 text-xs text-secondary-foreground">
            <strong>Why URL instead of headers?</strong> The Claude.ai custom-connector
            dialog has no header field, so the token travels in the URL path.
            Fine over HTTPS for personal use &mdash; treat the URL like a password.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Connect via Claude Code &mdash; one CLI command</p>
          <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>
              Run the command below in any terminal (replace{" "}
              <code className="font-mono text-xs">{placeholder}</code> with the raw
              token from above):
            </li>
          </ol>
          <CopyBlock value={claudeCodeCmd} mono />
          <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground" start={2}>
            <li>
              The <code className="font-mono text-xs">--scope user</code> flag writes
              to <code className="font-mono text-xs">~/.claude.json</code> so it
              applies to every Claude Code project.
            </li>
            <li>
              In a <strong>fresh</strong> Claude Code session, type{" "}
              <code className="font-mono text-xs">/mcp</code> &mdash; should show{" "}
              <code className="font-mono text-xs">clerkr-ideas</code> as{" "}
              <code className="font-mono text-xs">✓ Connected</code> with 6 tools.
            </li>
            <li>
              <strong>Verify:</strong> <code className="font-mono text-xs">claude mcp list</code>{" "}
              shows the connection state.
            </li>
          </ol>
          <p className="rounded bg-secondary/60 p-3 text-xs text-secondary-foreground">
            Header auth is cleaner than URL auth &mdash; the token never appears
            in URL logs or browser history.
          </p>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1.5 text-sm transition",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
