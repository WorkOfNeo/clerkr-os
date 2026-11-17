import type { NumbersScope } from "@/lib/numbers/access";

import { NumbersTabs } from "./NumbersTabs";
import { Clock } from "./ops/Clock";
import { Odometer } from "./ops/Odometer";
import { ClerkrLogo } from "./ops/ClerkrLogo";
import "./ops/ops-board.css";
import "./ops/tokens.css";

/**
 * The numbers board's frame for the reading tabs (Website, Omsætning), in the
 * look of Clerkr's /ops-board: same header, same panels, same tokens. The
 * Drift tab IS the ops-board (./ops/OpsBoard.tsx) and draws its own header.
 */

export function ObFrame({
  scopes,
  active,
  base,
  status,
  children,
}: {
  scopes: NumbersScope[];
  active: NumbersScope;
  /** Where the board is mounted — /numbers, or a share link's /n/<token> (./tabs.ts). */
  base: string;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ob-root" data-flow>
      <main className="ob">
        <header className="ob-head">
          <div className="ob-brandrow">
            <div className="ob-brand">
              <ClerkrLogo title="Clerkr" />
              Clerkr
            </div>
            <NumbersTabs scopes={scopes} active={active} base={base} />
          </div>
          <span className="ob-pill" role="status">
            <span className="ob-pill-dot" aria-hidden />
            {status}
          </span>
          <Clock initial={new Date().toISOString()} />
        </header>
        {children}
      </main>
    </div>
  );
}

/** A panel with the ops-board's header row. */
export function ObPanel({
  title,
  meta,
  right,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ob-panel">
      <div className="ob-ph">
        <h2>{title}</h2>
        {meta ? <span className="ob-meta">{meta}</span> : null}
        {right ? <div className="ob-ph-right">{right}</div> : null}
      </div>
      <div className="ob-pb">{children}</div>
    </section>
  );
}

export function ObCell({ label, value, delta, cap }: { label: string; value: string; delta?: { text: string; up?: boolean } | null; cap?: React.ReactNode }) {
  return (
    <div className="ob-cell">
      <span className="ob-lbl">{label}</span>
      <span className="ob-big">
        <Odometer value={value} />
        {delta ? (
          <span className="ob-delta" data-up={delta.up || undefined}>
            <Odometer value={delta.text} />
          </span>
        ) : null}
      </span>
      {cap ? <span className="ob-cap">{cap}</span> : null}
    </div>
  );
}

const INT = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
export const fmtInt = (n: number) => INT.format(Math.round(n));
export const fmtKr = (n: number) => `${INT.format(Math.round(n))} kr.`;

export function pctDelta(current: number, previous: number | null | undefined): { text: string; up?: boolean } | null {
  if (previous == null || previous <= 0) return null;
  const p = Math.round(((current - previous) / previous) * 100);
  return { text: `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`, up: p > 0 };
}

/** Area line, server-rendered. `step` draws MRR as a staircase. */
export function ObLine({ values, height = 120, label, step = false }: { values: number[]; height?: number; label: string; step?: boolean }) {
  if (values.length < 2) {
    return <p className="ob-empty">Kurven tegnes, når der er to dages tal.</p>;
  }
  const W = 1000;
  const H = height;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 14);
  let d = `M0 ${y(values[0])}`;
  values.forEach((v, i) => {
    if (i === 0) return;
    d += step ? ` L${x(i)} ${y(values[i - 1])} L${x(i)} ${y(v)}` : ` L${x(i)} ${y(v)}`;
  });
  return (
    <svg className="ob-line-chart" viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${d} L${W} ${H} L0 ${H}Z`} fill="var(--ob-ink)" fillOpacity={0.06} />
      <path d={d} fill="none" stroke="var(--ob-ink)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ObRank({ items, format }: { items: { key: string; label: string; value: number }[]; format: (n: number, share: number) => string }) {
  if (items.length === 0) return <p className="ob-empty">Intet endnu.</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const sum = Math.max(1, items.reduce((s, i) => s + i.value, 0));
  return (
    <div className="ob-rank">
      {items.map((i) => (
        <div key={i.key} className="ob-rank-row">
          <span title={i.label}>{i.label}</span>
          <span className="ob-cbar">
            <i style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <b>
            <Odometer value={format(i.value, i.value / sum)} />
          </b>
        </div>
      ))}
    </div>
  );
}
