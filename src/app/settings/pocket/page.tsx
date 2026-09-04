import type { Metadata } from "next";

import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { CopyBlock } from "@/components/CopyBlock";
import { currentOrigin } from "@/lib/base-url";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { ConnectionForm } from "./ConnectionForm";
import { ConnectionList, type ConnectionRow } from "./ConnectionList";

export const metadata: Metadata = {
  title: "Pocket",
  description:
    "Send recordings from a Pocket device straight into Clerkr OS — they arrive as meetings with cards waiting to be accepted.",
};

export default async function PocketSettingsPage() {
  const session = await requireSession();

  const [origin, users, connections] = await Promise.all([
    currentOrigin(),
    db.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.pocketConnection.findMany({
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const webhookUrl = `${origin}/api/webhooks/pocket`;

  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    label: c.label,
    pocketEmail: c.pocketEmail,
    active: c.active,
    defaultKind: c.defaultKind,
    ownerLabel: c.user.name?.trim() || c.user.email,
    lastEventAt: c.lastEventAt,
    lastEvent: c.lastEvent,
    lastError: c.lastError,
    deliveries: c.deliveries,
    meetingsCreated: c.meetingsCreated,
  }));

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl space-y-10 px-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span>/</span>
          <span>Pocket</span>
        </div>

        <div>
          <h1 className="text-display text-[28px] font-semibold leading-tight">Pocket</h1>
          <p className="text-sm text-muted-foreground">
            When Pocket finishes processing a recording it posts the notes here.
            The recording becomes a meeting, and the AI proposes the decisions,
            features, action items and open questions it found &mdash;{" "}
            <strong className="font-medium text-foreground">
              as cards you accept
            </strong>
            , exactly as if you had pasted the transcript yourself. Nothing is
            filed to the feature library or the ticket queue on its own.
          </p>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Step 1 &mdash; Copy the URL</h2>
            <p className="text-xs text-muted-foreground">
              This is the endpoint Pocket posts to. It is the same for everyone
              on the team.
            </p>
          </div>
          <CopyBlock value={webhookUrl} mono />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              Step 2 &mdash; Add the webhook in Pocket
            </h2>
            <p className="text-xs text-muted-foreground">
              In the Pocket app: <strong>Integrations &rarr; Webhooks &rarr; Add</strong>.
            </p>
          </div>
          <ol className="space-y-2 rounded-lg border border-border p-4 text-sm">
            <li className="flex gap-3">
              <span className="text-muted-foreground">1.</span>
              <span>Paste the URL from step 1 as the destination.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-muted-foreground">2.</span>
              <span>
                Subscribe to <code className="rounded bg-secondary px-1 py-0.5 text-xs">summary.completed</code>.
                That is the event that fires once the transcript, summary and
                action items all exist &mdash; it is the only one needed.
                <span className="mt-1 block text-xs text-muted-foreground">
                  Optional extras:{" "}
                  <code className="rounded bg-secondary px-1 py-0.5">transcript.edited</code>{" "}
                  and{" "}
                  <code className="rounded bg-secondary px-1 py-0.5">speakers.labeled</code>{" "}
                  keep an already-filed meeting in sync after you tidy it up in
                  Pocket. Leave{" "}
                  <code className="rounded bg-secondary px-1 py-0.5">transcription.completed</code>{" "}
                  off &mdash; it arrives before the summary exists.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-muted-foreground">3.</span>
              <span>
                Save. Pocket shows a <strong>signing secret once</strong>. Copy
                it before you close the dialog &mdash; if you lose it you have
                to rotate the webhook in Pocket to get a new one.
              </span>
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              Step 3 &mdash; Paste the secret here
            </h2>
            <p className="text-xs text-muted-foreground">
              The secret is how we know a delivery really came from Pocket.
              Deliveries that don&rsquo;t match are rejected.
            </p>
          </div>
          <ConnectionForm users={users} currentUserId={session.user.id} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Step 4 &mdash; Send a test</h2>
            <p className="text-xs text-muted-foreground">
              Use Pocket&rsquo;s &ldquo;send test payload&rdquo; button, or just
              record something short. The connection below will show the
              delivery.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Connected accounts</h2>
          <ConnectionList connections={rows} />
        </section>

        <section className="space-y-2 border-t pt-6">
          <h2 className="text-base font-semibold">What happens to a recording</h2>
          <ol className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              1. Pocket finishes processing and posts the summary, action items
              and transcript here.
            </li>
            <li>
              2. A meeting is created under{" "}
              <Link href="/meetings" className="text-primary underline-offset-4 hover:underline">
                /meetings
              </Link>
              , holding all three.
            </li>
            <li>
              3. The reviewer agent reads it, checks each item against what
              already exists, and proposes cards with its reasoning shown.
            </li>
            <li>
              4. Your phone buzzes if you have notifications on. You accept the
              cards that are real; accepting an action item can be sent
              straight to the ticket queue.
            </li>
          </ol>
          <p className="pt-2 text-xs text-muted-foreground">
            Re-deliveries are safe: a recording is matched on its Pocket id, so
            a retry updates the meeting instead of making a second one, and
            cards you already accepted or dismissed are never proposed again.
            Deleting a recording in Pocket does <strong>not</strong> delete the
            meeting here.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
