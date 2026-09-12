import type { Metadata } from "next";

import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { db } from "@/lib/db";
import { RESET_DOMAIN, resetMode } from "@/lib/password-reset";
import { requireSuperadmin } from "@/lib/session";

import { PeopleTable, type AdminPerson } from "./PeopleTable";

export const metadata: Metadata = {
  title: "Admin",
  description: "Who can get in, what they can do, and how a lost password is recovered.",
};

// Recovery mode is read from the environment per request, so this page tells
// the truth the moment RESEND_API_KEY appears — no deploy, no cache to bust.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireSuperadmin();

  const [users, mode] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: { select: { sessions: true } },
      },
    }),
    Promise.resolve(resetMode()),
  ]);

  const people: AdminPerson[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    sessions: u._count.sessions,
  }));

  const superadmins = people.filter((p) => p.role === "SUPERADMIN").length;

  // The signup gate. An env var rather than a table, so it's shown read-only
  // here — the place to change it is Railway.
  const allowlist = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl space-y-10 px-6 py-8">
        <PageHeader
          title="Admin"
          subtitle="Who can get in, what they can do, and how a lost password is recovered."
        />

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">People</h2>
            <p className="text-xs text-muted-foreground">
              Everyone signed in can read and edit everything — that's by design.
              Superadmin is narrower: it's who can reach this page, change a
              role, and mint a reset link for someone else.{" "}
              {superadmins === 1
                ? "You're the only superadmin, so nobody can demote you."
                : `${superadmins} superadmins.`}
            </p>
          </div>
          <PeopleTable people={people} currentUserId={session.user.id} mode={mode} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Password recovery</h2>
            <p className="text-xs text-muted-foreground">
              What happens when someone uses “Forgot?” on the sign-in screen.
            </p>
          </div>

          {mode === "email" ? (
            <div className="surface flex gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2} />
              <div className="space-y-1 text-[13px]">
                <p className="font-medium">Confirmed by email</p>
                <p className="text-muted-foreground">
                  <code className="font-mono text-[11.5px]">RESEND_API_KEY</code>{" "}
                  is set, so a reset link is emailed to the address and the inbox
                  is the only way to the form. Links last one hour and work once;
                  a reset signs out every device on that account.
                </p>
              </div>
            </div>
          ) : (
            <div className="surface flex gap-3 p-4">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                strokeWidth={2}
              />
              <div className="space-y-1 text-[13px]">
                <p className="font-medium">Unconfirmed — anyone can reset by address</p>
                <p className="text-muted-foreground">
                  No{" "}
                  <code className="font-mono text-[11.5px]">RESEND_API_KEY</code>,
                  so there is no way to send a link. Typing any @{RESET_DOMAIN}{" "}
                  address on the forgot-password page goes straight to the
                  new-password form, with nothing to confirm it's really them.
                  Anyone who can reach the sign-in page can take over any
                  @{RESET_DOMAIN} account this way.
                </p>
                <p className="text-muted-foreground">
                  Set{" "}
                  <code className="font-mono text-[11.5px]">RESEND_API_KEY</code>{" "}
                  (and optionally{" "}
                  <code className="font-mono text-[11.5px]">RESEND_FROM</code>) in
                  Railway and this switches to email confirmation on the next
                  request. No deploy, no code change.
                </p>
              </div>
            </div>
          )}

          <div className="surface flex gap-3 p-4">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <div className="space-y-1 text-[13px]">
              <p className="font-medium">Addresses outside @{RESET_DOMAIN}</p>
              <p className="text-muted-foreground">
                They can't use the forgot-password page at all. Use “Reset link”
                above and send them the URL.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Signup allowlist</h2>
            <p className="text-xs text-muted-foreground">
              Only these addresses can create an account.{" "}
              <code className="font-mono text-[11.5px]">ALLOWED_EMAILS</code> is
              an environment variable — change it in Railway, not here.
            </p>
          </div>
          <div className="surface p-4">
            {allowlist.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Empty — nobody can sign up.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {allowlist.map((email) => (
                  <li
                    key={email}
                    className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px]"
                  >
                    {email}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
