import { ObCell, ObFrame, ObLine, ObPanel, fmtInt, fmtKr } from "@/components/numbers/ObFrame";
import { latestSnapshot } from "@/lib/numbers/snapshot";
import { loadRevenue, mrrAtStartOfMonth, revenueHistory, type RevenueRow } from "@/lib/numbers/revenue";

import { gate } from "../gate";

export const dynamic = "force-dynamic";

function status(f: RevenueRow): { label: string; tone?: "ok" | "warn" } {
  if (!f.isActive) return { label: "Inaktiv i Clerkr" };
  if (f.isDemo) return { label: "Demo", tone: "warn" };
  if (f.inTrial) {
    const ends = f.trialEndsAt
      ? f.trialEndsAt.toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })
      : null;
    return { label: ends ? `Prøveperiode · slutter ${ends}` : "Prøveperiode", tone: "warn" };
  }
  return { label: "Kunde", tone: "ok" };
}

/** Revenue as the founders manage it (/admin/revenue-firms), in the ops-board's look. */
export default async function NumbersRevenuePage() {
  const access = await gate("revenue");
  const [rev, history, monthStart, snap] = await Promise.all([
    loadRevenue(),
    revenueHistory(),
    mrrAtStartOfMonth(),
    latestSnapshot(),
  ]);
  const activeUsers = new Map(snap?.data.firms.map((f) => [f.id, f.activeUsers7d]) ?? []);
  const move = monthStart == null ? 0 : rev.mrr - monthStart;

  return (
    <ObFrame
      scopes={access.scopes}
      active="revenue"
      status={
        <>
          <span>Omsætning</span>
          <span className="ob-pill-sub">kr. ekskl. moms · beløb I selv har sat</span>
        </>
      }
    >
      <section className="ob-panel ob-strip" data-cols style={{ ["--ob-cols" as string]: 5 }} aria-label="Nøgletal">
        <ObCell
          label="MRR"
          value={fmtKr(rev.mrr)}
          delta={move !== 0 ? { text: `${move > 0 ? "+" : "−"}${fmtInt(Math.abs(move))}`, up: move > 0 } : null}
          cap="denne måned"
        />
        <ObCell label="ARR" value={fmtKr(rev.arr)} cap="MRR × 12" />
        <ObCell label="Betalende kontorer" value={fmtInt(rev.payingFirms)} cap="på dashboardet" />
        <ObCell label="Kontorer på demo" value={fmtInt(rev.onDemo)} cap={<><b>{fmtInt(rev.onDemoOnDashboard)}</b> på dashboardet</>} />
        <ObCell label="Pipeline MRR" value={fmtKr(rev.pipeline)} cap="jeres skøn, når demoen er slut" />
      </section>

      <ObPanel title="Kontorer på dashboardet" meta={`${fmtInt(rev.rows.length)} kontorer`}>
        {rev.rows.length === 0 ? (
          <p className="ob-empty">
            Ingen kontorer er slået til endnu. En superadmin gør det, med beløbene, i clerkr-internal under
            Admin › Revenue firms.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ob-table">
              <thead>
                <tr>
                  <th>Kontor</th>
                  <th>Status i Clerkr</th>
                  <th className="ob-r">Pr. måned</th>
                  <th className="ob-r">Skøn når færdig</th>
                  <th className="ob-r">Aktive brugere · 7 d</th>
                </tr>
              </thead>
              <tbody>
                {rev.rows.map((f) => {
                  const st = status(f);
                  const au = activeUsers.get(f.orgId);
                  return (
                    <tr key={f.orgId}>
                      <td>{f.name}</td>
                      <td>
                        <span className="ob-tag" data-tone={st.tone}>
                          {st.label}
                        </span>
                      </td>
                      <td className={`ob-r${f.monthlyDkk ? "" : " ob-dim"}`}>{f.monthlyDkk ? fmtKr(f.monthlyDkk) : "–"}</td>
                      <td className={`ob-r${f.estimateDkk ? "" : " ob-dim"}`}>{f.estimateDkk ? fmtKr(f.estimateDkk) : "–"}</td>
                      <td className="ob-r">{au == null ? "–" : fmtInt(au)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ObPanel>

      <ObPanel title="MRR siden start" meta="ét punkt pr. dag">
        <ObLine values={history.map((h) => h.mrrDkk)} height={100} label="MRR pr. dag" step />
      </ObPanel>
    </ObFrame>
  );
}
