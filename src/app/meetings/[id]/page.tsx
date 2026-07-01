import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/AppNav";
import { ActionItemTaskButton } from "@/components/meeting/ActionItemTaskButton";
import { ActionItemToggle } from "@/components/meeting/ActionItemToggle";
import { PromoteSignalButton } from "@/components/meeting/PromoteSignalButton";
import { StructureButton } from "@/components/meeting/StructureButton";
import { Badge } from "@/components/ui/badge";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { formatShortDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const KIND_LABEL = {
  INTERNAL: "Internal",
  CUSTOMER: "Customer",
  PROSPECT: "Prospect",
} as const;

const SIGNAL_META = {
  NEW: { label: "New idea", variant: "default" as const },
  ALREADY_TRACKED: { label: "Already tracked", variant: "secondary" as const },
  SMALL_UNIQUE: { label: "Small / unique", variant: "outline" as const },
};

export default async function MeetingBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      featureSignals: {
        orderBy: { createdAt: "asc" },
        include: { feature: { select: { slug: true } } },
      },
      actionItems: { orderBy: { createdAt: "asc" } },
      openQuestions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!meeting) notFound();

  const aiReady = isOpenAIAvailable();

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-6 py-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
          <span>/</span>
          <span className="truncate">{meeting.title}</span>
        </div>

        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{meeting.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {KIND_LABEL[meeting.kind]} · {formatShortDate(meeting.meetingDate)}
              {meeting.attendees.length > 0 && <> · {meeting.attendees.join(", ")}</>}
            </p>
          </div>
          <StructureButton
            meetingId={meeting.id}
            hasBrief={Boolean(meeting.structuredAt)}
            disabled={!aiReady}
          />
        </div>

        {!aiReady && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            OpenAI is not configured — set <code className="text-foreground">OPENAI_API_KEY</code> to
            enable brief extraction. The transcript is still saved.
          </div>
        )}

        {meeting.structuredAt ? (
          <>
            {meeting.tldr && (
              <section className="rounded-lg border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">TL;DR</h2>
                <p className="text-sm text-muted-foreground">{meeting.tldr}</p>
              </section>
            )}

            <BriefSection title="Decisions made" count={meeting.decisions.length}>
              {meeting.decisions.map((d) => (
                <li key={d.id} className="flex gap-3 border-b py-2 last:border-0">
                  <Badge variant="secondary" className="h-fit whitespace-nowrap">
                    Decided
                  </Badge>
                  <div>
                    <p className="text-sm">{d.content}</p>
                    {d.owner && (
                      <p className="text-xs text-muted-foreground">Owner: {d.owner}</p>
                    )}
                  </div>
                </li>
              ))}
            </BriefSection>

            <BriefSection title="Feature signals" count={meeting.featureSignals.length}>
              {meeting.featureSignals.map((f) => {
                const meta = SIGNAL_META[f.status];
                return (
                  <li
                    key={f.id}
                    className="flex items-start justify-between gap-3 border-b py-2 last:border-0"
                  >
                    <div className="flex gap-3">
                      <Badge variant={meta.variant} className="h-fit whitespace-nowrap">
                        {meta.label}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{f.title}</p>
                        {f.detail && (
                          <p className="text-xs text-muted-foreground">{f.detail}</p>
                        )}
                        {f.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {f.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <PromoteSignalButton signalId={f.id} featureSlug={f.feature?.slug ?? null} />
                  </li>
                );
              })}
            </BriefSection>

            <BriefSection title="Action items" count={meeting.actionItems.length}>
              {meeting.actionItems.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 border-b py-2 last:border-0"
                >
                  <div className="flex items-start gap-3">
                    <ActionItemToggle id={a.id} done={a.done} />
                    <div>
                      <p className={cn("text-sm", a.done && "text-muted-foreground line-through")}>
                        {a.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.assignee ?? "Unassigned"}
                        {a.dueDate && <> · due {formatShortDate(a.dueDate)}</>}
                      </p>
                    </div>
                  </div>
                  <ActionItemTaskButton actionItemId={a.id} onBoard={Boolean(a.taskId)} />
                </li>
              ))}
            </BriefSection>

            <BriefSection title="Open questions" count={meeting.openQuestions.length}>
              {meeting.openQuestions.map((q) => (
                <li key={q.id} className="flex gap-3 border-b py-2 last:border-0">
                  <span className="text-muted-foreground">?</span>
                  <p className="text-sm">{q.content}</p>
                </li>
              ))}
            </BriefSection>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            This meeting hasn’t been structured yet.{" "}
            {aiReady
              ? "Click “Structure with AI” to extract the brief."
              : "Configure OpenAI to extract a brief."}
          </div>
        )}

        {/* transcript */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Transcript</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {meeting.transcript}
          </pre>
        </section>
      </main>
    </div>
  );
}

function BriefSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-muted-foreground">{count}</span>
      </h2>
      <ul>{children}</ul>
    </section>
  );
}
