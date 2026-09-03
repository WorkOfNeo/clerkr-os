import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { MeetingIntakeForm } from "@/components/meeting/MeetingIntakeForm";
import { requireSession } from "@/lib/session";

export default async function NewMeetingPage() {
  const session = await requireSession();

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h1 className="text-display mb-1 text-[28px] font-semibold leading-tight">New meeting</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Save the meeting, then structure it into a brief on the next screen.
        </p>
        <MeetingIntakeForm />
      </main>
    </AppShell>
  );
}
