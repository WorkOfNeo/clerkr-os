"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteWikiNote, updateWikiNote } from "@/app/wiki/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

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
  const [body, setBody] = useState(note.body);

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
        <Label>Body</Label>
        {/* Live markdown, same editor as everywhere else — it formats as you
            type rather than being a textarea you have to imagine rendered.
            The value rides in a hidden field so the form action is unchanged. */}
        <RichTextEditor value={body} onChange={setBody} />
        <input type="hidden" name="body" value={body} />
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
