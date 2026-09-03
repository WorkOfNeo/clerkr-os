import type { Metadata } from "next";

import { listMemories, listPlaybooks } from "@/app/memory/actions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { MemoryList } from "@/components/memory/MemoryList";
import { PlaybookList } from "@/components/memory/PlaybookList";
import { RunPassButton } from "@/components/memory/RunPassButton";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Memory",
  description:
    "What the assistant has learned about how this team works, and the playbooks it follows.",
};

export default async function MemoryPage() {
  const session = await requireSession();
  const [memories, playbooks] = await Promise.all([listMemories(), listPlaybooks()]);

  const active = memories.filter((m) => m.status === "ACTIVE").length;
  const waiting = memories.filter((m) => m.status === "PROPOSED").length;

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl space-y-10 px-6 py-8">
        <PageHeader
          title="Memory"
          subtitle={
            waiting > 0
              ? `${waiting} waiting on you · ${active} in force`
              : `${active} memories in force. A pass runs each night over the day's conversations.`
          }
          actions={<RunPassButton />}
        />

        <MemoryList memories={memories} />
        <PlaybookList playbooks={playbooks} />
      </main>
    </AppShell>
  );
}
