import { marked } from "marked";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { AttachmentGrid } from "@/components/ticket/AttachmentGrid";
import { CommentComposer } from "@/components/ticket/CommentComposer";
import { TicketControls } from "@/components/ticket/TicketControls";
import { CategoryBadge, PriorityLabel } from "@/components/ticket/TicketBadges";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { TICKET_SOURCES } from "@/lib/ticket-meta";
import { ticketDetailSelect } from "@/lib/tickets";
import { requireSession } from "@/lib/session";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;

  const [ticket, categories] = await Promise.all([
    db.ticket.findUnique({ where: { slug }, select: ticketDetailSelect }),
    db.ticketCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!ticket) notFound();

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl py-6">
        <Link href="/tickets" className="text-xs text-muted-foreground hover:underline">
          ← Tickets
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">
              <span className="mr-2 font-mono text-sm text-muted-foreground">
                #{ticket.number}
              </span>
              {ticket.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Raised {formatShortDate(ticket.createdAt)}</span>
              <span>
                by {ticket.reportedBy ?? (ticket.author.name || ticket.author.email)}
                {ticket.source !== "MANUAL" && ` · ${TICKET_SOURCES[ticket.source]}`}
              </span>
              {ticket.resolvedAt && <span>closed {formatShortDate(ticket.resolvedAt)}</span>}
              <PriorityLabel priority={ticket.priority} />
              <CategoryBadge category={ticket.category} />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <TicketControls
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            categoryId={ticket.category?.id ?? null}
            categories={categories}
          />
        </div>

        <section className="mt-4 rounded-lg border bg-card p-4">
          {ticket.body ? (
            <div
              className="prose prose-sm prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: marked.parse(ticket.body) as string }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No detail given.</p>
          )}
          <AttachmentGrid attachments={ticket.attachments} />
        </section>

        <h2 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ticket.comments.length === 0
            ? "No comments yet"
            : `${ticket.comments.length} ${ticket.comments.length === 1 ? "comment" : "comments"}`}
        </h2>

        {ticket.comments.length > 0 && (
          <ul className="mb-4 space-y-2">
            {ticket.comments.map((c) => (
              <li key={c.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.author.name || c.author.email}
                  </span>
                  <span>{formatShortDate(c.createdAt)}</span>
                  {c.source !== "MANUAL" && <span>· {TICKET_SOURCES[c.source]}</span>}
                </div>
                <div
                  className="prose prose-sm prose-invert mt-1.5 max-w-none"
                  dangerouslySetInnerHTML={{ __html: marked.parse(c.body) as string }}
                />
                <AttachmentGrid attachments={c.attachments} />
              </li>
            ))}
          </ul>
        )}

        <CommentComposer ticketId={ticket.id} status={ticket.status} />
      </main>
    </div>
  );
}
