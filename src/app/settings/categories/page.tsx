import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { CategoryEditor } from "@/components/ticket/CategoryEditor";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export default async function CategoriesSettingsPage() {
  const session = await requireSession();
  const categories = await db.ticketCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tickets: true } } },
  });

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-2xl px-6 space-y-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span>/</span>
          <span>Ticket categories</span>
        </div>
        <div>
          <h1 className="text-display text-[28px] font-semibold leading-tight">Ticket categories</h1>
          <p className="text-sm text-muted-foreground">
            The types you can tag a ticket with. Add your own — no deploy needed. Deleting
            one leaves its tickets in place, just uncategorised.
          </p>
        </div>
        <CategoryEditor categories={categories} />
      </main>
    </AppShell>
  );
}
