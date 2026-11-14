import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db";

/**
 * The hourly snapshot the Clerkr worker pushes (Clerkr-V2:
 * apps/worker/src/stats-push.ts). Counts only — the schema below is strict, so
 * a payload that grows a field nobody agreed to (an email, a name of a person)
 * is refused rather than stored.
 */

const Kpi = z
  .object({
    logins: z.number(),
    activeUsers: z.number(),
    chats: z.number(),
    messages: z.number(),
    docsCreated: z.number(),
    docsProcessed: z.number(),
    toolCalls: z.number(),
    costUsd: z.number(),
  })
  .strict();
export type Kpi = z.infer<typeof Kpi>;

const Firm = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().max(200),
    isActive: z.boolean(),
    isDemo: z.boolean(),
    inTrial: z.boolean(),
    trialEndsAt: z.string().nullable(),
    subscriptionStatus: z.string().max(40),
    users: z.number(),
    activeUsers7d: z.number(),
    chats7d: z.number(),
    docs7d: z.number(),
    llmCostUsd7d: z.number(),
    lastActiveAt: z.string().nullable(),
    // Set by a superadmin on the firm in app.clerkr.ai (/admin/orgs/[id]).
    revenueOnBoard: z.boolean(),
    revenueMonthlyDkk: z.number().nullable(),
    revenueEstimateDkk: z.number().nullable(),
  })
  .strict();
export type SnapshotFirm = z.infer<typeof Firm>;

export const StatsPayload = z
  .object({
    kind: z.literal("stats"),
    version: z.literal(1),
    environment: z.string().min(1).max(40),
    generatedAt: z.string().datetime({ offset: true }),
    kpis: z.object({ "24h": Kpi, "7d": Kpi, "30d": Kpi, prev7d: Kpi }).strict(),
    totals: z
      .object({
        firms: z.number(),
        activeFirms7d: z.number(),
        activeFirmsPrev7d: z.number(),
        users: z.number(),
        documentsProcessedAllTime: z.number(),
      })
      .strict(),
    firms: z.array(Firm).max(5000),
  })
  .strict();
export type StatsPayload = z.infer<typeof StatsPayload>;

/**
 * The ops-board snapshot (Clerkr-V2 ops-board loader's OpsSnapshot), pushed
 * every 30 s. Checked for shape at the top level only — the view tolerates its
 * own type, and the body is signed by our own worker.
 */
export const OpsPayload = z
  .object({
    kind: z.literal("ops"),
    version: z.literal(1),
    environment: z.string().min(1).max(40),
    generatedAt: z.string().datetime({ offset: true }),
    ops: z
      .object({
        now: z.string(),
        night: z.boolean(),
        today: z.record(z.number()),
        last24: z.record(z.array(z.number())),
        yesterdaySoFar: z.number(),
        days: z.array(z.object({ date: z.string(), total: z.number(), weekend: z.boolean() })),
        mail: z.record(z.number()),
        tasks: z.object({ created: z.number(), done: z.number() }),
        agentRuns: z.object({ today: z.number(), week: z.array(z.number()), weekday: z.number() }),
        chat: z.object({ avgMs: z.number().nullable(), firstTokenMs: z.number().nullable() }),
        spend: z.object({ costUsd: z.number(), costPrevUsd: z.number(), tokens: z.number() }),
        live: z.array(z.object({ id: z.string(), name: z.string(), org: z.string(), module: z.string(), isLive: z.boolean(), lastSeen: z.string() })).max(500),
        feed: z.array(z.object({ id: z.string(), channel: z.string(), title: z.string(), name: z.string(), at: z.string() })).max(500),
      })
      .strict(),
  })
  .strict();
export type OpsPayload = z.infer<typeof OpsPayload>;

/**
 * The share links, as app.clerkr.ai holds them — the FULL list, revoked ones
 * included, every 30 s. Hashes only; a token never leaves the app after it
 * was shown once to the superadmin who made it.
 */
export const LinksPayload = z
  .object({
    kind: z.literal("links"),
    version: z.literal(1),
    environment: z.string().min(1).max(40),
    generatedAt: z.string().datetime({ offset: true }),
    links: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            label: z.string().max(120),
            tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
            scopes: z.array(z.enum(["product", "website", "revenue"])),
            expiresAt: z.string().datetime({ offset: true }).nullable(),
            revokedAt: z.string().datetime({ offset: true }).nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type LinksPayload = z.infer<typeof LinksPayload>;

export const IngestPayload = z.discriminatedUnion("kind", [StatsPayload, OpsPayload, LinksPayload]);

/**
 * Replaces the link mirror with the app's list: upsert every link, delete any
 * the app no longer has. lastUsedAt is the only column that survives.
 */
export async function storeLinks(payload: LinksPayload) {
  const ids = payload.links.map((l) => l.id);
  await db.$transaction([
    db.numbersLink.deleteMany({ where: { id: { notIn: ids } } }),
    ...payload.links.map((l) => {
      const data = {
        label: l.label,
        tokenHash: l.tokenHash,
        scopes: l.scopes,
        expiresAt: l.expiresAt ? new Date(l.expiresAt) : null,
        revokedAt: l.revokedAt ? new Date(l.revokedAt) : null,
        syncedAt: new Date(),
      };
      return db.numbersLink.upsert({ where: { id: l.id }, create: { id: l.id, ...data }, update: data });
    }),
  ]);
}

/** How far a request's timestamp may be from now before it's treated as a replay. */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifySignature(opts: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = opts;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{10,16}$/.test(timestamp)) return false;
  const skew = Math.abs((opts.now ?? Date.now()) - Number(timestamp));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_MS) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, rawBody), "utf8");
  const given = Buffer.from(signature, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Environments whose snapshots the board shows. Production only, unless
 * STATS_ACCEPT_ENVS widens it — which is for a local test run, never for the
 * deployed board: the founders asked for prod numbers and nothing else.
 */
export function acceptedEnvironments(): string[] {
  const raw = process.env.STATS_ACCEPT_ENVS?.trim();
  if (!raw) return ["production"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Overwrites the latest ops snapshot for its environment. No history: see the model. */
export async function storeOps(payload: OpsPayload) {
  const data = { generatedAt: new Date(payload.generatedAt), payload: payload.ops as unknown as object };
  await db.clerkrOpsLatest.upsert({
    where: { environment: payload.environment },
    create: { environment: payload.environment, ...data },
    update: data,
  });
}

export async function latestOps() {
  const rows = await db.clerkrOpsLatest.findMany({
    where: { environment: { in: acceptedEnvironments() } },
    orderBy: { generatedAt: "desc" },
    take: 1,
  });
  return rows[0] ?? null;
}

export type LatestSnapshot = { generatedAt: Date; receivedAt: Date; environment: string; data: StatsPayload };

export async function latestSnapshot(): Promise<LatestSnapshot | null> {
  const row = await db.clerkrStatsSnapshot.findFirst({
    where: { environment: { in: acceptedEnvironments() } },
    orderBy: { generatedAt: "desc" },
  });
  if (!row) return null;
  const parsed = StatsPayload.safeParse(row.payload);
  if (!parsed.success) return null;
  return { generatedAt: row.generatedAt, receivedAt: row.receivedAt, environment: row.environment, data: parsed.data };
}

/** Keep about four months of hourly snapshots; trends past that come from RevenueDay. */
const KEEP_DAYS = 120;

/** Stores a verified stats snapshot and prunes old ones. */
export async function storeSnapshot(payload: StatsPayload) {
  await db.clerkrStatsSnapshot.create({
    data: {
      environment: payload.environment,
      generatedAt: new Date(payload.generatedAt),
      payload: payload as unknown as object,
    },
  });

  await db.clerkrStatsSnapshot.deleteMany({
    where: { receivedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
  });
}
