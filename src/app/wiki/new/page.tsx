import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createWikiNoteFromForm } from "../actions";

export default async function NewWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; tags?: string }>;
}) {
  const session = await requireSession();
  const { title: initialTitle, tags: initialTags } = await searchParams;

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-2xl space-y-6 py-8">
        <div>
          <h1 className="text-xl font-semibold">New wiki note</h1>
          <p className="text-sm text-muted-foreground">
            Markdown. The note gets embedded for semantic search on save.
          </p>
        </div>
        <form action={createWikiNoteFromForm} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={initialTitle ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" name="tags" defaultValue={initialTags ?? ""} placeholder="convention, sprint-3" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Body (markdown)</Label>
            <Textarea id="body" name="body" rows={12} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <a href="/wiki">Cancel</a>
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
