"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteWikiNote, updateWikiNote } from "@/app/wiki/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  note: {
    id: string;
    slug: string;
    title: string;
    body: string;
    tags: string[];
  };
}

export function WikiNoteEditor({ note }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(formData: FormData) {
    formData.set("id", note.id);
    start(async () => {
      await updateWikiNote(formData);
      router.push(`/wiki/${note.slug}`);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    start(async () => {
      await deleteWikiNote(note.id);
    });
  }

  return (
    <form action={save} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={note.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input id="tags" name="tags" defaultValue={note.tags.join(", ")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Body (markdown)</Label>
        <Textarea id="body" name="body" rows={16} defaultValue={note.body} required />
      </div>
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
          Delete note
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={`/wiki/${note.slug}`}>Cancel</a>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
