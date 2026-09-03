import type { Metadata } from "next";

import Link from "next/link";

import { deviceCount, pushStatus } from "@/app/notifications/actions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { InstallGuide } from "@/components/notifications/InstallGuide";
import { PushToggle } from "@/components/notifications/PushToggle";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Install & notifications",
  description:
    "Put Clerkr OS on your home screen, and choose what reaches you when it's closed.",
};

export default async function NotificationSettingsPage() {
  const session = await requireSession();
  const [{ publicKey }, devices] = await Promise.all([pushStatus(), deviceCount()]);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-2xl space-y-8 px-6 py-8">
        <PageHeader
          title="Install & notifications"
          subtitle="Put Clerkr OS on your home screen, and choose what reaches you when it's closed."
          breadcrumb={
            <>
              <Link href="/settings" className="hover:underline">
                Settings
              </Link>
              <span>/</span>
              <span>Install &amp; notifications</span>
            </>
          }
        />

        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">Install the app</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              It runs without the address bar, keeps you signed in, and — on iPhone — is the only
              way notifications can reach you.
            </p>
          </div>
          <InstallGuide />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">Notifications on this device</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {devices === 0
                ? "No devices registered yet."
                : `${devices} device${devices === 1 ? "" : "s"} registered.`}
            </p>
          </div>
          <PushToggle publicKey={publicKey} />
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold">What you&apos;ll be told</h2>
          <ul className="space-y-1.5 text-[13px] text-muted-foreground">
            <li>A card on the board is due today, or has gone past due.</li>
            <li>Claude filed a ticket while you weren&apos;t looking.</li>
            <li>Intake proposals are still sitting unconfirmed after a day.</li>
            <li>An open ticket has gone untouched for ten days or more.</li>
          </ul>
          <p className="pt-1 text-[12.5px] text-muted-foreground/80">
            Each of these fires once per fact — an overdue card nags once a day, a stale ticket
            once a week. Nothing repeats every few minutes.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
