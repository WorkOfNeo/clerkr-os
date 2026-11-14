import type { Metadata } from "next";
import Link from "next/link";

import "@/components/numbers/numbers.css";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Badge, relTime } from "@/components/numbers/parts";
import { db } from "@/lib/db";
import { requireSuperadmin } from "@/lib/session";

import { revokeNumbersLink } from "../numbers-actions";
import { CreateLinkForm } from "./CreateLinkForm";

export const metadata: Metadata = { title: "Share links" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { product: "Product", website: "Website", revenue: "Revenue" };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function NumbersLinksPage() {
  const session = await requireSuperadmin();
  const links = await db.numbersLink.findMany({ orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }] });
  const now = Date.now();

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
        <PageHeader
          title="Share links"
          subtitle={
            <>
              Each link opens the <Link href="/numbers" className="underline">numbers board</Link> and nothing else.
              Revoking one stops it on the next page load.
            </>
          }
        />
        <div className="nb" data-embedded style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CreateLinkForm />
          {links.length === 0 ? (
            <div className="nb-empty">No links yet.</div>
          ) : (
            <div className="nb-table-wrap">
              <table className="nb-table">
                <thead>
                  <tr>
                    <th>For</th>
                    <th>Shows</th>
                    <th>Expires</th>
                    <th>Last opened</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => {
                    const expired = l.expiresAt != null && l.expiresAt.getTime() <= now;
                    const dead = Boolean(l.revokedAt) || expired;
                    return (
                      <tr key={l.id}>
                        <td className={dead ? "nb-dim" : undefined}>{l.label}</td>
                        <td className={dead ? "nb-dim" : undefined}>{l.scopes.map((s) => LABEL[s] ?? s).join(" · ")}</td>
                        <td>
                          {l.revokedAt ? (
                            <Badge tone="red">Revoked {day(l.revokedAt)}</Badge>
                          ) : expired ? (
                            <Badge tone="red">Expired</Badge>
                          ) : l.expiresAt ? (
                            day(l.expiresAt)
                          ) : (
                            "Never"
                          )}
                        </td>
                        <td className={dead ? "nb-dim" : undefined}>{relTime(l.lastUsedAt)}</td>
                        <td className="nb-num">
                          {!dead ? (
                            <form action={revokeNumbersLink}>
                              <input type="hidden" name="id" value={l.id} />
                              <button type="submit" className="nb-btn" data-variant="secondary">
                                Revoke
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
