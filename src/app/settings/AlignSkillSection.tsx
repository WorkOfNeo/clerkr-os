"use client";

import { Download } from "lucide-react";

import { CopyBlock } from "@/components/CopyBlock";

const CC_INSTALL = `mkdir -p ~/.claude/skills/clerkr-os-align
pbpaste > ~/.claude/skills/clerkr-os-align/SKILL.md   # after copying the block above`;

/**
 * The clerkr-os-align skill: Claude, holding both the Clerkr OS and NEO Ledger
 * connectors, brings kanban subtasks up to date with the Ledger's plans. The
 * text is read from skills/clerkr-os-align/SKILL.md by the page, so the file
 * in the repo is the only copy.
 */
export function AlignSkillSection({ skill }: { skill: string }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium">The clerkr-os-align skill</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Type <code className="font-mono">clerkr-os-align</code> (optionally with a card like{" "}
          <code className="font-mono">#12</code>, or <code className="font-mono">all</code>) and
          Claude reads each linked card&rsquo;s NEO Ledger plan, ticks the subtasks whose
          Ledger work is done, and tells you what differs. It needs both the Clerkr OS and
          NEO Ledger connectors, and it never writes to the Ledger.
        </p>
      </div>

      <CopyBlock
        label="SKILL.md (skills/clerkr-os-align/SKILL.md)"
        value={skill}
        mono
        maxHeight="320px"
      />

      <a
        href={`data:text/markdown;charset=utf-8,${encodeURIComponent(skill)}`}
        download="SKILL.md"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
      >
        <Download className="h-3.5 w-3.5" />
        Download SKILL.md
      </a>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Install in Claude (web &amp; desktop)</p>
        <ol className="ml-4 list-decimal space-y-1.5 text-muted-foreground">
          <li>
            Download SKILL.md, put it in a folder named{" "}
            <code className="font-mono text-xs">clerkr-os-align</code>, and zip the folder.
          </li>
          <li>Upload the zip as a custom skill in Claude&rsquo;s settings (Capabilities → Skills).</li>
          <li>Make sure the Clerkr OS and NEO Ledger connectors are both enabled in the chat.</li>
        </ol>
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Install in Claude Code</p>
        <p className="text-muted-foreground">
          Copy the block above, then run this. It&rsquo;s{" "}
          <code className="font-mono text-xs">/clerkr-os-align</code> in a new session.
        </p>
        <CopyBlock value={CC_INSTALL} mono />
      </div>
    </div>
  );
}
