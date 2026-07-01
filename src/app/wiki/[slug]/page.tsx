import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/wiki/MarkdownView";
import { WikiNoteEditor } from "@/components/wiki/WikiNoteEditor";

export default async function WikiNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;
  const { edit } = await searchParams;

  const note = await db.wikiNote.findUnique({
    where: { slug },
    include: { author: { select: { email: true, name: true } } },
  });
  if (!note) notFound();

  if (edit) {
    return (
      <div className="min-h-screen">
        <AppNav email={session.user.email} />
        <main className="container max-w-2xl space-y-6 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/wiki" className="hover:underline">
              Wiki
            </Link>
            <span>/</span>
            <Link href={`/wiki/${note.slug}`} className="hover:underline">
              {note.slug}
            </Link>
            <span>/</span>
            <span>edit</span>
          </div>
          <WikiNoteEditor note={note} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-2xl space-y-6 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/wiki" className="hover:underline">
            Wiki
          </Link>
          <span>/</span>
          <span>{note.slug}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{note.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{note.author.email}</span>
              <span>·</span>
              <span>
                Updated{" "}
                {new Date(note.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {note.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
              {!note.embeddedAt && <Badge variant="outline">no embedding</Badge>}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/wiki/${note.slug}?edit=1`}>Edit</Link>
          </Button>
        </div>

        <MarkdownView body={note.body} />
      </main>
    </div>
  );
}
