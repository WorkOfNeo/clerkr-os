import { db } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";

import { embedFeature, embedMeeting, findSimilarFeature } from "./embed-entities";

// After a meeting is structured, this runs the "do everything" pass:
//   1. embed the meeting for semantic recall
//   2. for each new feature signal: assign a cluster, dedupe against the
//      existing library (link if it's the same request), else auto-promote it
//      into a Feature and embed it.
// Best-effort: individual failures are logged, never thrown, so a hiccup can't
// lose the structured brief.

const SIGNAL_TO_FEATURE_STATUS = {
  NEW: "IDEA",
  ALREADY_TRACKED: "VALIDATED",
  SMALL_UNIQUE: "SMALL_UNIQUE",
} as const;

// Cosine similarity above which two signals are treated as the same feature.
const DEDUPE_THRESHOLD = 0.82;

export interface EnrichSignal {
  id: string;
  title: string;
  detail: string | null;
  status: "NEW" | "ALREADY_TRACKED" | "SMALL_UNIQUE";
  tags: string[];
  cluster: string | null;
}

async function ensureCluster(name: string): Promise<string> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const existing = await db.cluster.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.cluster.create({
    data: { name: trimmed, slug, autoSuggested: true },
    select: { id: true },
  });
  return created.id;
}

export async function enrichMeeting(meetingId: string, signals: EnrichSignal[]): Promise<void> {
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { title: true, tldr: true, transcript: true },
  });
  if (meeting) {
    try {
      await embedMeeting(meetingId, meeting.title, meeting.tldr ?? "", meeting.transcript);
    } catch (err) {
      console.warn("[enrich] embedMeeting failed:", err);
    }
  }

  for (const s of signals) {
    try {
      const clusterId = s.cluster ? await ensureCluster(s.cluster) : null;
      const match = await findSimilarFeature(`${s.title}\n${s.detail ?? ""}`);

      if (match && match.similarity >= DEDUPE_THRESHOLD) {
        // Same request already in the library — link the signal, mark tracked,
        // and adopt the cluster if the existing feature had none.
        await db.featureSignal.update({
          where: { id: s.id },
          data: { featureId: match.id, status: "ALREADY_TRACKED" },
        });
        if (clusterId) {
          await db.feature.updateMany({
            where: { id: match.id, clusterId: null },
            data: { clusterId },
          });
        }
      } else {
        // New request — auto-promote into a Feature and embed it.
        const slug = await uniqueSlug(slugify(s.title), async (c) =>
          Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
        );
        const feature = await db.feature.create({
          data: {
            title: s.title,
            slug,
            description: s.detail,
            tags: s.tags,
            status: SIGNAL_TO_FEATURE_STATUS[s.status],
            clusterId,
          },
          select: { id: true },
        });
        try {
          await embedFeature(feature.id, s.title, s.detail ?? "");
        } catch (err) {
          console.warn("[enrich] embedFeature failed:", err);
        }
        await db.featureSignal.update({
          where: { id: s.id },
          data: { featureId: feature.id },
        });
      }
    } catch (err) {
      console.warn("[enrich] signal failed:", err);
    }
  }
}
