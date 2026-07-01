"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookmarkPlus } from "lucide-react";

import { saveAssistantTurnToWiki } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  messageId: string;
  defaultTitle: string;
  defaultBody: string;
  defaultTags?: string[];
}

export function SaveToWikiButton({ messageId, defaultTitle, defaultBody, defaultTags }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle.slice(0, 60));
  const [body, setBody] = useState(defaultBody);
  const [tagsStr, setTagsStr] = useState((defaultTags ?? []).join(", "));

  function save() {
    start(async () => {
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { slug } = await saveAssistantTurnToWiki({ messageId, title, body, tags });
      setOpen(false);
      router.push(`/wiki/${slug}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <BookmarkPlus className="h-3 w-3" />
          Save to wiki
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save to wiki</DialogTitle>
          <DialogDescription>
            Edit the title and body. The embedding runs after save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Tags (comma-separated)</label>
            <Input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="decision, sprint-3"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Body</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending || !title.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
