"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { createPlaybook, deletePlaybook, updatePlaybook } from "@/app/memory/actions";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/wiki/MarkdownView";
import { cn } from "@/lib/utils";

export interface PlaybookItem {
  id: string;
  name: string;
  trigger: string;
  body: string;
  enabled: boolean;
  timesUsed: number;
}

/**
 * Playbooks are the answer to "stop asking me the same three questions".
 * A procedure written once, followed every time — and editable by the people
 * who know how the work should be done rather than by whoever deploys.
 */
export function PlaybookList({ playbooks }: { playbooks: PlaybookItem[] }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Playbooks</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Written procedures the assistant follows instead of working a task out again — or
            asking you questions the playbook already answers.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating((c) => !c)}>
          <Plus className="h-3.5 w-3.5" />
          New playbook
        </Button>
      </div>

      {creating && <Editor onDone={() => setCreating(false)} />}

      {playbooks.length === 0 && !creating && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-[14px] font-medium">No playbooks yet</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            Write one for anything you have explained twice — how a bug report should be shaped,
            what a meeting note should become, which board a kind of work belongs on.
          </p>
        </div>
      )}

      {playbooks.map((p) =>
        editingId === p.id ? (
          <Editor key={p.id} playbook={p} onDone={() => setEditingId(null)} />
        ) : (
          <Row key={p.id} playbook={p} onEdit={() => setEditingId(p.id)} />
        ),
      )}
    </div>
  );
}

function Row({ playbook, onEdit }: { playbook: PlaybookItem; onEdit: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg bg-card p-3.5 shadow-[0_0_0_1px_hsl(var(--hairline))]",
        !playbook.enabled && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">{playbook.name}</span>
            {!playbook.enabled && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">off</span>
            )}
            {playbook.timesUsed > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                used {playbook.timesUsed}×
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            Applies when: {playbook.trigger}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await updatePlaybook({ id: playbook.id, enabled: !playbook.enabled });
                toast(playbook.enabled ? "Playbook off" : "Playbook on");
                router.refresh();
              })
            }
          >
            {playbook.enabled ? "Disable" : "Enable"}
          </Button>
          <Button size="xs" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deletePlaybook(playbook.id);
                toast("Playbook deleted");
                router.refresh();
              })
            }
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-md bg-muted/40 p-3">
          <MarkdownView body={playbook.body} className="text-[13px]" />
        </div>
      )}
    </div>
  );
}

function Editor({ playbook, onDone }: { playbook?: PlaybookItem; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(playbook?.name ?? "");
  const [trigger, setTrigger] = useState(playbook?.trigger ?? "");
  const [body, setBody] = useState(playbook?.body ?? "");

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3.5">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Filing a bug report" />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium">Applies when</label>
        <Textarea
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          rows={2}
          placeholder="Someone describes something broken — an error, wrong output, something that used to work."
          className="text-[13px]"
        />
        <p className="mt-1 text-[12px] text-muted-foreground">
          Write the situation, not a title. This is matched against what was actually typed.
        </p>
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium">The procedure</label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="Steps. What to fill in without asking, and what genuinely needs a question."
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending || !name.trim() || !trigger.trim() || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              if (playbook) await updatePlaybook({ id: playbook.id, name, trigger, body });
              else await createPlaybook({ name, trigger, body });
              toast(playbook ? "Playbook saved" : "Playbook created", { tone: "success" });
              onDone();
              router.refresh();
            })
          }
        >
          {playbook ? "Save" : "Create playbook"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
