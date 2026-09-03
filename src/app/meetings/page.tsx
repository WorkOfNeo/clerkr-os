import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { requireSession } from "@/lib/session";

const KIND_LABEL = {
  INTERNAL: "Internal",
  CUSTOMER: "Customer",
  PROSPECT: "Prospect",
} as const;

export default async function MeetingsPage() {
  const session = await requireSession();
  const meetings = await db.meeting.findMany({
    orderBy: { meetingDate: "desc" },
    select: {
      id: true,
      title: true,
      kind: true,
      meetingDate: true,
      structuredAt: true,
      _count: { select: { decisions: true, featureSignals: true, actionItems: true } },
    },
  });

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <PageHeader
          title="Meetings"
          subtitle="Paste a transcript — the AI structures it into a scannable brief."
          actions={
            <Button asChild size="sm">
              <Link href="/meetings/new">New meeting</Link>
            </Button>
          }
        />

        {meetings.length === 0 ? (
          <div className="surface border-dashed p-14 text-center text-sm text-muted-foreground">
            No meetings yet.{" "}
            <Link href="/meetings/new" className="text-foreground underline">
              Add your first one →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/meetings/${m.id}`}
                  className="block surface-interactive p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-medium">{m.title}</h2>
                    {m.structuredAt ? (
                      <Badge variant="secondary">Brief ready</Badge>
                    ) : (
                      <Badge variant="outline">Not structured</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{KIND_LABEL[m.kind]}</span>
                    <span>{formatShortDate(m.meetingDate)}</span>
                    {m.structuredAt && (
                      <>
                        <span>{m._count.decisions} decisions</span>
                        <span>{m._count.featureSignals} signals</span>
                        <span>{m._count.actionItems} actions</span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
