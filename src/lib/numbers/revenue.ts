import { db } from "@/lib/db";

/**
 * Revenue is managed by hand at /admin/revenue-firms — firms don't sign up and
 * pay on their own, so neither Stripe nor the seat price in Clerkr is the truth.
 *
 *  MRR       = Σ monthlyDkk   over firms switched on with a monthly amount
 *  Pipeline  = Σ estimateDkk  over firms switched on that have no monthly amount yet
 *  On demo   = active firms Clerkr marks as a demo or that are still in trial,
 *              counted whether or not they're switched on
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
};

export type RevenueSummary = {
  mrr: number;
  arr: number;
  pipeline: number;
  payingFirms: number;
  onDemo: number;
  onDemoOnDashboard: number;
  rows: RevenueRow[];
};

type FirmLike = RevenueRow & { onDashboard: boolean };

export const isOnDemo = (f: { isActive: boolean; isDemo: boolean; inTrial: boolean }) =>
  f.isActive && (f.isDemo || f.inTrial);

export function summariseRevenue(firms: FirmLike[]): RevenueSummary {
  const on = firms.filter((f) => f.onDashboard);
  const paying = on.filter((f) => (f.monthlyDkk ?? 0) > 0);
  const pipelineFirms = on.filter((f) => !((f.monthlyDkk ?? 0) > 0) && (f.estimateDkk ?? 0) > 0);
  const mrr = paying.reduce((sum, f) => sum + (f.monthlyDkk ?? 0), 0);
  const pipeline = pipelineFirms.reduce((sum, f) => sum + (f.estimateDkk ?? 0), 0);

  const rows = [...on].sort(
    (a, b) =>
      (b.monthlyDkk ?? 0) - (a.monthlyDkk ?? 0) ||
      (b.estimateDkk ?? 0) - (a.estimateDkk ?? 0) ||
      a.name.localeCompare(b.name, "da"),
  );

  return {
    mrr,
    arr: mrr * 12,
    pipeline,
    payingFirms: paying.length,
    onDemo: firms.filter(isOnDemo).length,
    onDemoOnDashboard: on.filter(isOnDemo).length,
    rows: rows.map(({ onDashboard: _on, ...r }) => r),
  };
}

export async function loadRevenue(): Promise<RevenueSummary> {
  const firms = await db.revenueFirm.findMany();
  return summariseRevenue(firms);
}

/** Today's date at UTC midnight — the RevenueDay key. */
function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Writes today's MRR point. Called after a snapshot lands and after an amount is saved. */
export async function recordRevenueDay() {
  const s = await loadRevenue();
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
