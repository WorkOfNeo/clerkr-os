import { redirect } from "next/navigation";

import type { NumbersScope } from "@/lib/numbers/access";
import { analyticsConfigured, loadWebsiteNumbers, type WebsiteNumbers } from "@/lib/numbers/analyticsos";
import { loadRevenue, mrrAtStartOfMonth, revenueHistory, type RevenueRow } from "@/lib/numbers/revenue";
import { latestOps } from "@/lib/numbers/snapshot";

import { BoardRoot } from "./BoardRoot";
import { LoopToggle } from "./LoopToggle";
import { NumbersTabs } from "./NumbersTabs";
import { ObCell, ObFrame, ObLine, ObPanel, ObRank, fmtInt, fmtKr, pctDelta } from "./ObFrame";
import { OpsBoard } from "./ops/OpsBoard";
import { TV_H, TV_W, type OpsSnapshot } from "./ops/snapshot";
import { scopeHref } from "./tabs";
import "./ops/ops-board.css";
import "./ops/tokens.css";

/**
 * The board's tabs, rendered the same wherever the board is mounted:
 * /numbers (src/app/numbers, a signed-in superadmin) and /n/<token>
 * (src/app/n/[token], the share link's token in the path). The pages only decide who
 * gets in; everything a viewer sees is here. `base` is the mount point
 * (./tabs.ts) — every link and poll on the board is built from it.
 */
type BoardProps = { scopes: NumbersScope[]; base: string };

/** Copied from Clerkr's ops-board page: scales the 1920×1080 canvas to the screen before first paint. */
const FIT_SCRIPT = `(function(){var s=document.createElement('style');s.id='ob-fit';document.head.appendChild(s);function fit(){s.textContent=':root{--ob-fit:'+Math.min(innerWidth/${TV_W},innerHeight/${TV_H})+'}'}fit();addEventListener('resize',fit)})()`;

/**
 * Drift — Clerkr's /ops-board, fed by the Clerkr prod worker's push instead of
 * a database connection. First paint is the latest stored snapshot; the board
 * then polls `${base}/live`.
 */
export async function DriftView({ scopes, base }: BoardProps) {
  if (!scopes.includes("product")) redirect(scopeHref(scopes[0], base));

  const latest = await latestOps();
  if (!latest) {
    return (
      <ObFrame scopes={scopes} active="product" base={base} status={<span>Venter på prod</span>}>
        <p className="ob-empty" style={{ fontSize: 15 }}>
          Der er ikke kommet tal fra Clerkr endnu. Clerkr-workeren sender dem, når STATS_PUSH_URL og
          STATS_PUSH_SECRET er sat på dens production-service.
        </p>
      </ObFrame>
    );
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FIT_SCRIPT }} />
      <OpsBoard
        initial={latest.payload as unknown as OpsSnapshot}
        pollUrl={`${base}/live`}
        brand={<LoopToggle />}
        nav={<NumbersTabs scopes={scopes} active="product" base={base} />}
      />
    </>
  );
}

/**
 * The logo slide: the mark alone, large and centred, between the loop's last
 * tab and its first. No numbers, so every viewer gets it whatever their link's
 * scopes. The mark is still the play/pause, and the loop runs underneath with
 * its tabs undrawn.
 */
export function LogoView({ scopes, base }: BoardProps) {
  return (
    <BoardRoot>
      <main className="ob-logo-slide">
        <LoopToggle hero />
        <NumbersTabs scopes={scopes} active="logo" base={base} chrome={false} />
      </main>
    </BoardRoot>
  );
}

/** clerkr.ai traffic from AnalyticsOS, drawn in the ops-board's look. */
export async function WebsiteView({ scopes, base }: BoardProps) {
  if (!analyticsConfigured()) {
    return (
      <ObFrame scopes={scopes} active="website" base={base} status={<span>Ikke forbundet</span>}>
        <p className="ob-empty" style={{ fontSize: 15 }}>
          AnalyticsOS er ikke forbundet. Sæt ANALYTICSOS_API_KEY (en Read-nøgle), ANALYTICSOS_WORKSPACE og
          ANALYTICSOS_APP_ID på clerkr-internal.
        </p>
      </ObFrame>
    );
  }

  let w: WebsiteNumbers;
  try {
    w = await loadWebsiteNumbers();
  } catch (err) {
    console.error("[numbers] AnalyticsOS unavailable:", err instanceof Error ? err.message : "unknown");
    return (
      <ObFrame scopes={scopes} active="website" base={base} status={<span>AnalyticsOS svarer ikke</span>}>
        <p className="ob-empty" style={{ fontSize: 15 }}>
          AnalyticsOS svarede ikke lige nu. Drift og Omsætning virker stadig. Prøv igen om et minut.
        </p>
      </ObFrame>
    );
  }

  const cell = (label: string, t: WebsiteNumbers["visitors"], cap: string) => (
    <ObCell label={label} value={fmtInt(t.value)} delta={pctDelta(t.value, t.previous)} cap={cap} />
  );

  return (
    <ObFrame
      scopes={scopes}
      active="website"
      base={base}
      status={
        <>
          <span>clerkr.ai</span>
          <span className="ob-pill-sub">sidste 30 dage · AnalyticsOS</span>
        </>
      }
    >
      <section className="ob-panel ob-strip" data-cols style={{ ["--ob-cols" as string]: 5 }} aria-label="Nøgletal">
        {cell("Besøgende", w.visitors, "vs. de 30 dage før")}
        {cell("Sidevisninger", w.pageviews, "vs. de 30 dage før")}
        {cell("Book en demo åbnet", w.demoOpened, "vs. de 30 dage før")}
        {cell("Demoer booket", w.demoBooked, "vs. de 30 dage før")}
        {cell("Kontaktformularer", w.contactSent, "vs. de 30 dage før")}
      </section>

      <ObPanel title="Besøgende pr. dag" meta="sidste 30 dage">
        <ObLine values={w.daily.values} label="Besøgende pr. dag, sidste 30 dage" />
      </ObPanel>

      <div className="ob-two">
        <ObPanel title="Mest sete sider" meta="sidevisninger">
          <ObRank items={w.topPages} format={(n) => fmtInt(n)} />
        </ObPanel>
        <ObPanel title="Hvor de kommer fra" meta="andel af besøgende">
          <ObRank
            items={w.sources.map((s) => ({ ...s, label: !s.label || s.label === "(none)" ? "Direkte" : s.label }))}
            format={(_n, share) => `${Math.round(share * 100)} %`}
          />
        </ObPanel>
      </div>
    </ObFrame>
  );
}

function revenueStatus(f: RevenueRow): { label: string; tone?: "ok" | "warn" } {
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

/** Revenue as the founders set it in app.clerkr.ai, in the ops-board's look. */
export async function RevenueView({ scopes, base }: BoardProps) {
  const [rev, history, monthStart] = await Promise.all([loadRevenue(), revenueHistory(), mrrAtStartOfMonth()]);

  if (!rev) {
    return (
      <ObFrame scopes={scopes} active="revenue" base={base} status={<span>Venter på prod</span>}>
        <p className="ob-empty" style={{ fontSize: 15 }}>Der er ikke kommet tal fra Clerkr endnu.</p>
      </ObFrame>
    );
  }
  const move = monthStart == null ? 0 : rev.mrr - monthStart;

  return (
    <ObFrame
      scopes={scopes}
      active="revenue"
      base={base}
      status={
        <>
          <span>Omsætning</span>
          <span className="ob-pill-sub">kr. ekskl. moms · beløb sat i app.clerkr.ai</span>
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
        <ObCell label="Betalende kontorer" value={fmtInt(rev.payingFirms)} cap="på boardet" />
        <ObCell label="Kontorer på demo" value={fmtInt(rev.onDemo)} cap={<><b>{fmtInt(rev.onDemoOnBoard)}</b> på boardet</>} />
        <ObCell label="Pipeline MRR" value={fmtKr(rev.pipeline)} cap="jeres skøn, når demoen er slut" />
      </section>

      <ObPanel title="Kontorer på boardet" meta={`${fmtInt(rev.rows.length)} kontorer`}>
        {rev.rows.length === 0 ? (
          <p className="ob-empty">
            Ingen kontorer er slået til endnu. En superadmin gør det på kontoret i app.clerkr.ai under
            Admin › Kontorer › Omsætning på tal-boardet.
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
                  const st = revenueStatus(f);
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
                      <td className="ob-r">{fmtInt(f.activeUsers7d)}</td>
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

/** The dead end for a share link that's unknown, revoked or expired, drawn at the link's own address. */
export function LinkUnavailable() {
  return (
    <div className="ob-root" data-flow>
      <main className="ob">
        <div className="ob-dead">
          <h1>Linket virker ikke længere</h1>
          <p>Det er blevet trukket tilbage eller er udløbet. Bed den, der delte det, om et nyt.</p>
        </div>
      </main>
    </div>
  );
}
