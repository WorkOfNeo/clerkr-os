import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import { MeetingIntakeForm } from "@/components/meeting/MeetingIntakeForm";
import { requireSession } from "@/lib/session";

export default async function NewMeetingPage() {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-2xl py-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold">New meeting</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Save the meeting, then structure it into a brief on the next screen.
        </p>
        <MeetingIntakeForm />
      </main>
    </div>
  );
}
