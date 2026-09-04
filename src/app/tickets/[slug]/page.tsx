import type { Metadata } from "next";
import { marked } from "marked";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { AttachmentGrid } from "@/components/ticket/AttachmentGrid";
import { TicketBody } from "@/components/ticket/TicketBody";
import { CommentComposer } from "@/components/ticket/CommentComposer";
import { CategoryBadge, PriorityLabel } from "@/components/ticket/TicketBadges";
import { TicketControls } from "@/components/ticket/TicketControls";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { TICKET_SOURCES } from "@/lib/ticket-meta";
import { ticketDetailSelect } from "@/lib/tickets";
import { requireSession } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ticket = await db.ticket.findUnique({
    where: { slug },
    select: { number: true, title: true, body: true },
  });
  if (!ticket) return { title: "Ticket" };
  return {
    title: `#${ticket.number} ${ticket.title}`,
    description: ticket.body?.slice(0, 160) ?? `Ticket #${ticket.number} in the Clerkr OS queue.`,
  };
}

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

  const who = (u: { name: string; email: string }) => u.name || u.email;

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Tickets
        </Link>

        <header className="mt-3">
          <h1 className="text-display text-[26px] font-semibold leading-snug">
            <span className="mr-2.5 font-mono text-[17px] font-normal text-muted-foreground">
              #{ticket.number}
            </span>
            {ticket.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
            <span>
              Raised by{" "}
              <span className="text-foreground">
                {ticket.reportedBy ?? who(ticket.author)}
              </span>{" "}
              on {formatShortDate(ticket.createdAt)}
            </span>
            {ticket.source !== "MANUAL" && <span>· {TICKET_SOURCES[ticket.source]}</span>}
            {ticket.resolvedAt && <span>· closed {formatShortDate(ticket.resolvedAt)}</span>}
            <PriorityLabel priority={ticket.priority} />
            <CategoryBadge category={ticket.category} />
          </div>

          <div className="mt-3.5">
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              categoryId={ticket.category?.id ?? null}
              categories={categories}
            />
          </div>
        </header>

        <section className="surface mt-5 p-5">
          <TicketBody ticketId={ticket.id} body={ticket.body} />
          <AttachmentGrid attachments={ticket.attachments} />
        </section>

        {ticket.comments.length > 0 && (
          <ol className="mt-6 space-y-3">
            {ticket.comments.map((c) => (
              <li key={c.id} className="surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
                    {who(c.author).slice(0, 1)}
                  </span>
                  <span className="font-medium">{who(c.author)}</span>
                  <span className="text-muted-foreground">
                    {formatShortDate(c.createdAt)}
                  </span>
                  {c.source !== "MANUAL" && (
                    <span className="text-muted-foreground">· {TICKET_SOURCES[c.source]}</span>
                  )}
                </div>
                <div
                  className="md mt-2"
                  dangerouslySetInnerHTML={{ __html: marked.parse(c.body) as string }}
                />
                <AttachmentGrid attachments={c.attachments} />
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6">
          <CommentComposer ticketId={ticket.id} status={ticket.status} />
        </div>
      </main>
    </AppShell>
  );
}
