import { db } from "@/lib/db";
import { upsertFeatureFromIdea } from "@/lib/features";

import { embedMeeting } from "./embed-entities";

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

export interface EnrichSignal {
  id: string;
  title: string;
  detail: string | null;
  status: "NEW" | "ALREADY_TRACKED" | "SMALL_UNIQUE";
  tags: string[];
  cluster: string | null;
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
      const { featureId, created } = await upsertFeatureFromIdea({
        title: s.title,
        detail: s.detail,
        tags: s.tags,
        cluster: s.cluster,
        status: SIGNAL_TO_FEATURE_STATUS[s.status],
      });
      // A match means the library already tracks this request — say so on the
      // signal. A miss means we just created the feature, so only link.
      await db.featureSignal.update({
        where: { id: s.id },
        data: created ? { featureId } : { featureId, status: "ALREADY_TRACKED" },
      });
    } catch (err) {
      console.warn("[enrich] signal failed:", err);
    }
  }
}
