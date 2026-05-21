"use client";

import { CopyBlock } from "@/components/CopyBlock";

import { CLAUDE_SKILL_MD } from "@/lib/claude-skill";

const CC_INSTALL = `mkdir -p ~/.claude/skills/clerkr-ideas
pbpaste > ~/.claude/skills/clerkr-ideas/SKILL.md   # after copying the block above`;

export function SkillSection() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium">The Clerkr Ideas skill</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This is what tells Claude <strong>when</strong> to use the MCP and{" "}
          <strong>how</strong> to fill the fields. It covers URL crawls
          (fetch og:tags, summarise, infer category/todo/painPoint), image
          captures (describe what&rsquo;s visible, OCR text, ask for a URL if
          needed), and the find / edit / delete flows.
        </p>
      </div>

      <CopyBlock
        label="SKILL.md (paste into ~/.claude/skills/clerkr-ideas/SKILL.md)"
        value={CLAUDE_SKILL_MD}
        mono
        maxHeight="380px"
      />

      <div className="space-y-2 text-sm">
        <p className="font-medium">Install (Claude Code, user scope)</p>
        <ol className="ml-4 list-decimal space-y-1.5 text-muted-foreground">
          <li>Copy the SKILL.md block above.</li>
          <li>Run the snippet below to drop it into your skills directory.</li>
          <li>
            Open a <strong>new</strong> Claude Code session &mdash; existing sessions
            do <em>not</em> see newly added skills.
          </li>
        </ol>
        <CopyBlock value={CC_INSTALL} mono />
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Install (Claude.ai web)</p>
        <p className="text-muted-foreground">
          Claude.ai doesn&rsquo;t have file-based skills; the same guidance
          lives inside the MCP server&rsquo;s <code className="font-mono text-xs">
          instructions</code> string (sent at the <code className="font-mono text-xs">
          initialize</code> handshake), so the web client already knows when to
          use the tools. No extra step needed.
        </p>
      </div>

      <p className="rounded bg-secondary/60 p-3 text-xs text-secondary-foreground">
        <strong>Test it:</strong> after install, drop a URL into a Claude
        chat with <em>&ldquo;add this to the board&rdquo;</em>. Claude should
        fetch the page, fill in title / description / image / todo / painPoint,
        and call <code className="font-mono text-xs">create_post</code> &mdash; then
        confirm one line.
      </p>
    </div>
  );
}
