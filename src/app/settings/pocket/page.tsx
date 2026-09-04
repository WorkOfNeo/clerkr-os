import type { Metadata } from "next";

import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { CopyBlock } from "@/components/CopyBlock";
import { currentOrigin } from "@/lib/base-url";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { ConnectionForm } from "./ConnectionForm";
import { ConnectionList, type ConnectionRow } from "./ConnectionList";
import {
  Code,
  EventTable,
  GoodToKnow,
  MeetingsLink,
  Pipeline,
  Step,
  Troubleshooting,
} from "./Guide";

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
              Record a meeting on a Pocket device and it turns up here on its
              own. The recording becomes a meeting holding Pocket&rsquo;s
              summary, its action items and the full transcript &mdash; then the
              AI reads it and proposes the decisions, features, action items and
              open questions it found.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-sm leading-6">
              <strong className="font-semibold">
                Nothing is filed without you.
              </strong>{" "}
              Everything the AI reads out of a recording arrives as a card you
              accept, edit or dismiss &mdash; exactly as if you had pasted the
              transcript in yourself. No feature, ticket or action item is
              created just because a recording ended.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Setting this up takes about five minutes and has to happen in order:
            Pocket generates a secret in step 2 that you paste back here in step
            3. Have the Pocket app open alongside this page.
          </p>
        </div>

        <div className="space-y-10">
          <Step
            n={1}
            title="Copy the webhook URL"
            lede="Where Pocket sends recordings. The same for everyone on the team — it is not a secret, and it identifies nobody on its own."
          >
            <CopyBlock value={webhookUrl} mono />
          </Step>

          <Step
            n={2}
            title="Create the webhook in Pocket"
            lede="In the Pocket app: Integrations → Webhooks → Add."
          >
            <ol className="space-y-2.5 text-sm leading-6">
              <li className="flex gap-2.5">
                <span className="text-muted-foreground">a.</span>
                <span>Paste the URL from step 1 as the destination.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-muted-foreground">b.</span>
                <span>
                  Tick the events below. If you tick only{" "}
                  <Code>summary.completed</Code>, everything works &mdash; the
                  rest are conveniences.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-muted-foreground">c.</span>
                <span>
                  Save. Pocket now shows a{" "}
                  <strong className="font-medium">signing secret</strong>, and it
                  shows it{" "}
                  <strong className="font-medium">exactly once</strong>. Copy it
                  before closing the dialog. Lose it and you have to rotate the
                  webhook in Pocket to get another.
                </span>
              </li>
            </ol>

            <EventTable />

            <p className="text-xs leading-5 text-muted-foreground">
              Organisation-wide webhooks work too, if an admin would rather set
              this once for the team than have each person do it &mdash; Pocket
              exposes those under{" "}
              <Code>/api/v1/organization/:orgId/webhooks</Code>. The URL and the
              secret behave the same way.
            </p>
          </Step>

          <Step
            n={3}
            title="Paste the secret here"
            lede="The secret is how a delivery is proven to have come from Pocket. Anything that doesn't match is rejected before a word of it is read."
          >
            <ConnectionForm users={users} currentUserId={session.user.id} />
            <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">
                  Pocket account email
                </strong>{" "}
                &mdash; the account the recordings belong to, so deliveries can
                be matched to the right connection.
              </li>
              <li>
                <strong className="font-medium text-foreground">
                  File meetings under
                </strong>{" "}
                &mdash; who ends up as the author, and who gets the notification
                when a recording lands.
              </li>
              <li>
                <strong className="font-medium text-foreground">
                  Default meeting type
                </strong>{" "}
                &mdash; internal, customer or prospect. Changeable on any meeting
                afterwards.
              </li>
            </ul>
          </Step>

          <Step
            n={4}
            title="Send a test"
            lede="Prove the round trip before you rely on it in a real meeting."
          >
            <p className="text-sm leading-6">
              Use Pocket&rsquo;s &ldquo;send test payload&rdquo; button, or just
              record thirty seconds of yourself talking. Within a few seconds the
              connection below should show a delivery, and a meeting should
              appear under <MeetingsLink />.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              If it doesn&rsquo;t, the connection card shows what went wrong, and
              the troubleshooting list further down says what to do about it.
            </p>
          </Step>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Connected accounts</h2>
          <ConnectionList connections={rows} />
        </section>

        <section className="space-y-4 border-t pt-8">
          <div>
            <h2 className="text-base font-semibold">What happens to a recording</h2>
            <p className="text-xs text-muted-foreground">
              Start to finish, once the device has stopped recording.
            </p>
          </div>
          <Pipeline />
          <p className="rounded-md bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
            Re-deliveries are safe by design. A recording is matched on its
            Pocket id, so a retry updates the meeting rather than making a second
            one, and any card you have already accepted or dismissed is never
            proposed at you again.
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
