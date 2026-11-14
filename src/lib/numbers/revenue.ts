import { db } from "@/lib/db";

import { latestSnapshot, type SnapshotFirm } from "./snapshot";

/**
 * Revenue as the founders set it in app.clerkr.ai (/admin/orgs/[id]: on the
 * board, monthly amount, estimate when the demo ends) and the worker pushes in
 * every stats snapshot. Nothing is edited here.
 *
 *  MRR       = Σ monthly   over firms on the board with a monthly amount
 *  Pipeline  = Σ estimate  over firms on the board with no monthly amount yet
 *  On demo   = active firms Clerkr marks as a demo or still in trial,
 *              counted whether or not they're on the board
 *  ARR       = MRR × 12
 */

export type RevenueRow = {
  orgId: string;
  name: string;
  monthlyDkk: number | null;
  estimateDkk: number | null;
  isActive: boolean;
  isDemo: boolean;
  inTrial: boolean;
  trialEndsAt: Date | null;
  activeUsers7d: number;
};

export type RevenueSummary = {
  mrr: number;
  arr: number;
  pipeline: number;
  payingFirms: number;
  onDemo: number;
  onDemoOnBoard: number;
  rows: RevenueRow[];
};

export const isOnDemo = (f: { isActive: boolean; isDemo: boolean; inTrial: boolean }) =>
  f.isActive && (f.isDemo || f.inTrial);

const has = (n: number | null) => (n ?? 0) > 0;

export function summariseRevenue(firms: SnapshotFirm[]): RevenueSummary {
  const on = firms.filter((f) => f.revenueOnBoard);
  const paying = on.filter((f) => has(f.revenueMonthlyDkk));
  const pipelineFirms = on.filter((f) => !has(f.revenueMonthlyDkk) && has(f.revenueEstimateDkk));
  const mrr = paying.reduce((sum, f) => sum + (f.revenueMonthlyDkk ?? 0), 0);
  const rows = [...on]
    .sort(
      (a, b) =>
        (b.revenueMonthlyDkk ?? 0) - (a.revenueMonthlyDkk ?? 0) ||
        (b.revenueEstimateDkk ?? 0) - (a.revenueEstimateDkk ?? 0) ||
        a.name.localeCompare(b.name, "da"),
    )
    .map((f) => ({
      orgId: f.id,
      name: f.name,
      monthlyDkk: f.revenueMonthlyDkk,
      estimateDkk: f.revenueEstimateDkk,
      isActive: f.isActive,
      isDemo: f.isDemo,
      inTrial: f.inTrial,
      trialEndsAt: f.trialEndsAt ? new Date(f.trialEndsAt) : null,
      activeUsers7d: f.activeUsers7d,
    }));
  return {
    mrr,
    arr: mrr * 12,
    pipeline: pipelineFirms.reduce((sum, f) => sum + (f.revenueEstimateDkk ?? 0), 0),
    payingFirms: paying.length,
    onDemo: firms.filter(isOnDemo).length,
    onDemoOnBoard: on.filter(isOnDemo).length,
    rows,
  };
}

export async function loadRevenue(): Promise<RevenueSummary | null> {
  const snap = await latestSnapshot();
  return snap ? summariseRevenue(snap.data.firms) : null;
}

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Writes today's MRR point. Called after each stats snapshot lands. */
export async function recordRevenueDay() {
  const s = await loadRevenue();
  if (!s) return;
  const data = { mrrDkk: s.mrr, pipelineDkk: s.pipeline, payingFirms: s.payingFirms };
  await db.revenueDay.upsert({ where: { day: today() }, create: { day: today(), ...data }, update: data });
}

export async function revenueHistory(days = 365) {
  return db.revenueDay.findMany({
    where: { day: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { day: "asc" },
  });
}

/** MRR on the first day of this month we have a point for, to show the month's movement. */
export async function mrrAtStartOfMonth(): Promise<number | null> {
  const d = new Date();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const row = await db.revenueDay.findFirst({ where: { day: { gte: first } }, orderBy: { day: "asc" } });
  return row?.mrrDkk ?? null;
}
