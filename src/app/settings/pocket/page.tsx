import type { Metadata } from "next";

import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { ConnectionForm } from "./ConnectionForm";
import { ConnectionList, type ConnectionRow } from "./ConnectionList";
import {
  Code,
  GoodToKnow,
  MeetingsLink,
  Pipeline,
  Step,
  Troubleshooting,
  WhatLeavesPocket,
} from "./Guide";

export const metadata: Metadata = {
  title: "Pocket",
  description:
    "Bring tagged Pocket recordings into Clerkr OS as meetings — everything else stays in Pocket.",
};

export default async function PocketSettingsPage() {
  const session = await requireSession();

  const [users, connections] = await Promise.all([
    db.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.pocketConnection.findMany({
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const rows: ConnectionRow[] = connections.map((c) => ({
    id: c.id,
    label: c.label,
    pocketEmail: c.pocketEmail,
    active: c.active,
    defaultKind: c.defaultKind,
    ownerLabel: c.user.name?.trim() || c.user.email,
    tagIds: c.tagIds,
    lastEventAt: c.lastEventAt,
    lastEvent: c.lastEvent,
    lastError: c.lastError,
    lastSeen: c.lastSeen,
    deliveries: c.deliveries,
    meetingsCreated: c.meetingsCreated,
  }));

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl space-y-12 px-6 py-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>
            <span>/</span>
            <span>Pocket</span>
          </div>

          <div>
            <h1 className="text-display text-[28px] font-semibold leading-tight">Pocket</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tag a recording <strong className="text-foreground">Clerkr</strong> in Pocket and
              it turns up here as a meeting &mdash; holding Pocket&rsquo;s summary, its action
              items and the full transcript &mdash; with the AI&rsquo;s proposals waiting on it.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-sm leading-6">
              <strong className="font-semibold">
                Only tagged recordings ever leave Pocket.
              </strong>{" "}
              Clerkr OS asks Pocket for recordings carrying your tag and nothing else, so a
              conversation you record for another client is not filtered out at this end &mdash;
              it is never requested. And{" "}
              <strong className="font-semibold">nothing is filed without you</strong>: what the
              AI reads out of a recording arrives as cards you accept, edit or dismiss.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Setup takes about five minutes. You will need the Pocket app open to make an API key
            and a tag.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">What actually leaves Pocket</h2>
          <WhatLeavesPocket />
        </section>

        <div className="space-y-10">
          <Step
            n={1}
            title="Make a tag in Pocket"
            lede="This is the switch that decides what comes here. Call it Clerkr."
          >
            <p className="text-sm leading-6">
              In the Pocket app, create a tag &mdash;{" "}
              <Code>Clerkr</Code> is the obvious name. From then on, tagging a recording is how
              you say &ldquo;this one belongs in Clerkr OS&rdquo;. You can tag during or after a
              recording.
            </p>
          </Step>

          <Step
            n={2}
            title="Create an API key"
            lede="Pocket app → Settings → API keys."
          >
            <p className="text-sm leading-6">
              Create a key and copy it &mdash; it starts with <Code>pk_</Code>. This is what lets
              Clerkr OS ask Pocket what you have tagged. Treat it like a password: it can read
              your recordings.
            </p>
          </Step>

          <Step
            n={3}
            title="Connect the account here"
            lede="Checked against Pocket as you save, so a wrong key is caught immediately."
          >
            <ConnectionForm users={users} currentUserId={session.user.id} />
            <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">Pocket account email</strong>{" "}
                &mdash; identifies the account, and is the key for replacing an API key later.
              </li>
              <li>
                <strong className="font-medium text-foreground">File meetings under</strong>{" "}
                &mdash; who ends up as the author of imported meetings.
              </li>
              <li>
                <strong className="font-medium text-foreground">Default meeting type</strong>{" "}
                &mdash; changeable on any meeting afterwards.
              </li>
            </ul>
          </Step>

          <Step
            n={4}
            title="Pick the tags"
            lede="Until you do, nothing syncs at all — that is the safe default, not a fault."
          >
            <p className="text-sm leading-6">
              On the connection below, press{" "}
              <strong className="font-medium">Choose tags</strong>. It reads the tags off your
              Pocket account; tick the one you made in step 1. Only recordings carrying a ticked
              tag are ever requested.
            </p>
          </Step>

          <Step
            n={5}
            title="Record, tag, and check it arrived"
            lede="It checks every ten minutes on its own."
          >
            <p className="text-sm leading-6">
              Record something short, tag it, then press{" "}
              <strong className="font-medium">Check now</strong> rather than waiting. It should
              appear under <MeetingsLink />.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Forgot to tag one?{" "}
              <Link
                href="/settings/pocket/browse"
                className="text-primary underline underline-offset-4"
              >
                Browse recordings
              </Link>{" "}
              lists everything by title &mdash; no transcripts fetched &mdash; and imports just
              the one you choose.
            </p>
          </Step>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Connected accounts</h2>
            {rows.length > 0 && (
              <Link
                href="/settings/pocket/browse"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Browse recordings &rarr;
              </Link>
            )}
          </div>
          <ConnectionList connections={rows} />
        </section>

        <section className="space-y-4 border-t pt-8">
          <div>
            <h2 className="text-base font-semibold">What happens to a recording</h2>
            <p className="text-xs text-muted-foreground">
              From tagging it to accepting the cards.
            </p>
          </div>
          <Pipeline />
          <p className="rounded-md bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
            Re-checking is safe. A recording is matched on its Pocket id, so it can only ever
            become one meeting, and any card you have already accepted or dismissed is never
            proposed again.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8">
          <div>
            <h2 className="text-base font-semibold">If something isn&rsquo;t working</h2>
            <p className="text-xs text-muted-foreground">
              Matched to what the connection card above actually says.
            </p>
          </div>
          <Troubleshooting />
        </section>

        <section className="space-y-4 border-t pt-8">
          <h2 className="text-base font-semibold">Good to know</h2>
          <GoodToKnow />
        </section>
      </main>
    </AppShell>
  );
}
