import type { Metadata } from "next";
import Link from "next/link";

import "@/components/numbers/numbers.css";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Badge, firmStatus, fmtKr, fmtNum } from "@/components/numbers/parts";
import { db } from "@/lib/db";
import { loadRevenue } from "@/lib/numbers/revenue";
import { requireSuperadmin } from "@/lib/session";

import { saveRevenueFirm } from "../numbers-actions";

export const metadata: Metadata = { title: "Revenue firms" };
export const dynamic = "force-dynamic";

export default async function RevenueFirmsPage() {
  const session = await requireSuperadmin();
  const [firms, rev] = await Promise.all([
    db.revenueFirm.findMany({ orderBy: [{ onDashboard: "desc" }, { isActive: "desc" }, { name: "asc" }] }),
    loadRevenue(),
  ]);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
        <PageHeader
          title="Revenue firms"
          subtitle={
            <>
              Every firm in Clerkr, from the latest production snapshot. New firms arrive switched off; only
              firms switched on count on the <Link href="/numbers/revenue" className="underline">Revenue tab</Link>.
            </>
          }
        />
        <div className="nb" data-embedded style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p className="nb-foot" style={{ margin: 0 }}>
            Now: MRR {fmtKr(rev.mrr)} from {fmtNum(rev.payingFirms)} firms · pipeline {fmtKr(rev.pipeline)} · {fmtNum(rev.onDemo)} firms on demo.
            A firm switched on with a monthly amount counts in MRR; switched on with only an estimate, it counts in pipeline.
          </p>
          {firms.length === 0 ? (
            <div className="nb-empty">No firms yet. They arrive with the first production snapshot from the Clerkr worker.</div>
          ) : (
            <div className="nb-table-wrap">
              <table className="nb-table">
                <thead>
                  <tr>
                    <th>On dashboard</th>
                    <th>Firm</th>
                    <th>Status in Clerkr</th>
                    <th className="nb-num">Monthly (kr.)</th>
                    <th className="nb-num">Est. when done (kr.)</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {firms.map((f) => {
                    const st = firmStatus(f);
                    const formId = `firm-${f.orgId}`;
                    return (
                      <tr key={f.orgId}>
                        <td>
                          <input form={formId} type="checkbox" name="onDashboard" defaultChecked={f.onDashboard} aria-label={`Count ${f.name} on the dashboard`} />
                        </td>
                        <td>{f.name}</td>
                        <td>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="nb-num">
                          <input form={formId} name="monthlyDkk" className="nb-input" data-num inputMode="numeric" defaultValue={f.monthlyDkk ?? ""} aria-label={`Monthly for ${f.name}`} />
                        </td>
                        <td className="nb-num">
                          <input form={formId} name="estimateDkk" className="nb-input" data-num inputMode="numeric" defaultValue={f.estimateDkk ?? ""} aria-label={`Estimate for ${f.name}`} />
                        </td>
                        <td>
                          <input form={formId} name="note" className="nb-input" defaultValue={f.note} maxLength={200} aria-label={`Note for ${f.name}`} style={{ width: "100%" }} />
                        </td>
                        <td className="nb-num">
                          <form id={formId} action={saveRevenueFirm}>
                            <input type="hidden" name="orgId" value={f.orgId} />
                            <button type="submit" className="nb-btn" data-variant="secondary">
                              Save
                            </button>
                          </form>
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
