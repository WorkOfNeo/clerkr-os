import Link from "next/link";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WikiSearchBox } from "@/components/wiki/WikiSearchBox";

export default async function WikiPage() {
  const session = await requireSession();
  const notes = await db.wikiNote.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      tags: true,
      updatedAt: true,
      embeddedAt: true,
      author: { select: { email: true } },
    },
  });

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-4xl space-y-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Wiki</h1>
            <p className="text-sm text-muted-foreground">
              Living knowledge — decisions, retros, conventions. The LLM searches this semantically.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/wiki/new">New note</Link>
          </Button>
        </div>

        <WikiSearchBox />

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">All notes</h2>
          {notes.length === 0 && (
            <div className="rounded-md border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              No notes yet.{" "}
              <Link href="/wiki/new" className="underline">
                Write the first one
              </Link>
              .
            </div>
          )}
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border bg-card p-3">
                <Link href={`/wiki/${n.slug}`} className="block hover:underline">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{n.title}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {!n.embeddedAt && <Badge variant="outline">no embedding</Badge>}
                      <span>
                        {new Date(n.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  {n.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {n.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
