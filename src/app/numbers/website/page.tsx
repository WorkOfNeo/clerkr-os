import { ObCell, ObFrame, ObLine, ObPanel, ObRank, fmtInt, pctDelta } from "@/components/numbers/ObFrame";
import { analyticsConfigured, loadWebsiteNumbers, type WebsiteNumbers } from "@/lib/numbers/analyticsos";

import { gate } from "../gate";

export const dynamic = "force-dynamic";

/** clerkr.ai traffic from AnalyticsOS, drawn in the ops-board's look. */
export default async function NumbersWebsitePage() {
  const access = await gate("website");

  if (!analyticsConfigured()) {
    return (
      <ObFrame scopes={access.scopes} active="website" status={<span>Ikke forbundet</span>}>
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
      <ObFrame scopes={access.scopes} active="website" status={<span>AnalyticsOS svarer ikke</span>}>
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
      scopes={access.scopes}
      active="website"
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
