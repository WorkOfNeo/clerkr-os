import { unstable_cache } from "next/cache";

/**
 * clerkr.ai traffic, read from AnalyticsOS's query API with a Read-only key
 * (POST {host}/api/w/{workspace}/query, Authorization: Bearer aos_…).
 * Server-side only: the key never reaches a browser. Cached for 10 minutes.
 *
 * The events are the ones clerkr-web-v2 already sends (lib/aos.ts there):
 * demo_opened, demo_booked, contact_sent — plus the script's own pageviews.
 */

const HOST = (process.env.ANALYTICSOS_HOST || "https://analyticsos.up.railway.app").replace(/\/+$/, "");

export function analyticsConfigured(): boolean {
  return Boolean(
    process.env.ANALYTICSOS_API_KEY && process.env.ANALYTICSOS_WORKSPACE && process.env.ANALYTICSOS_APP_ID,
  );
}

type Total = { value: number; previous: number | null; change: number | null };
type Item = { key: string; label: string; value: number };
type Shaped = { buckets: string[] | null; series: { values: number[]; period: string }[]; items: Item[]; total: Total | null };

async function query(q: Record<string, unknown>): Promise<Shaped> {
  const res = await fetch(`${HOST}/api/w/${encodeURIComponent(process.env.ANALYTICSOS_WORKSPACE ?? "")}/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.ANALYTICSOS_API_KEY}`,
    },
    body: JSON.stringify({
      query: { apps: [process.env.ANALYTICSOS_APP_ID], ...q },
      timeZone: "Europe/Copenhagen",
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: Shaped; error?: string } | null;
  if (!res.ok || !body?.ok || !body.result) {
    throw new Error(`AnalyticsOS query failed (${res.status})`);
  }
  return body.result;
}

const total = (q: Record<string, unknown>) =>
  query({ range: "last_30d", compare: "previous_period", ...q }).then((r) => r.total ?? { value: 0, previous: null, change: null });

export type WebsiteNumbers = {
  visitors: Total;
  pageviews: Total;
  demoOpened: Total;
  demoBooked: Total;
  contactSent: Total;
  daily: { buckets: string[]; values: number[] };
  topPages: Item[];
  sources: Item[];
  fetchedAt: string;
};

async function fetchWebsite(): Promise<WebsiteNumbers> {
  const [visitors, pageviews, demoOpened, demoBooked, contactSent, daily, pages, sources] = await Promise.all([
    total({ event: "pageview", measure: "unique_visitors" }),
    total({ event: "pageview", measure: "count" }),
    total({ event: "demo_opened", measure: "count" }),
    total({ event: "demo_booked", measure: "count" }),
    total({ event: "contact_sent", measure: "count" }),
    query({ event: "pageview", measure: "unique_visitors", interval: "day", range: "last_30d" }),
    query({ event: "pageview", measure: "count", breakdown: "path", range: "last_30d", limit: 6 }),
    query({ event: "pageview", measure: "unique_visitors", breakdown: "referrer_host", range: "last_30d", limit: 6 }),
  ]);
  const current = daily.series.find((s) => s.period === "current") ?? daily.series[0];
  return {
    visitors,
    pageviews,
    demoOpened,
    demoBooked,
    contactSent,
    daily: { buckets: daily.buckets ?? [], values: current?.values ?? [] },
    topPages: pages.items,
    sources: sources.items,
    fetchedAt: new Date().toISOString(),
  };
}

export const loadWebsiteNumbers = unstable_cache(fetchWebsite, ["numbers-website-v1"], { revalidate: 600 });
