import { z } from "zod";

// The shape of a Pocket webhook delivery.
// https://docs.heypocketai.com/docs/api/webhooks
//
// Deliberately loose. Every field we don't read is ignored rather than
// rejected, so Pocket adding a key can never start 400-ing meetings we would
// otherwise have captured — and a webhook that silently stops working is the
// worst failure this integration has. Only `event` and `recording.id` are
// genuinely required; everything else has a fallback.

const transcriptLine = z.object({
  speaker: z.string().nullish(),
  text: z.string().nullish(),
  start: z.number().nullish(),
  end: z.number().nullish(),
});

const pocketActionItem = z.object({
  title: z.string().nullish(),
  dueDate: z.string().nullish(),
  status: z.string().nullish(),
  isCompleted: z.boolean().nullish(),
});

const summarization = z.object({
  processingStatus: z.string().nullish(),
  v2: z
    .object({
      summary: z
        .object({
          title: z.string().nullish(),
          emoji: z.string().nullish(),
          markdown: z.string().nullish(),
          bulletPoints: z.array(z.string()).nullish(),
        })
        .nullish(),
      actionItems: z
        .object({ actionItems: z.array(pocketActionItem).nullish() })
        .nullish(),
    })
    .nullish(),
  createdAt: z.string().nullish(),
});

export const pocketWebhookSchema = z.object({
  event: z.string().min(1),
  timestamp: z.string().nullish(),
  user: z.object({ id: z.string().nullish(), email: z.string().nullish() }).nullish(),
  organization: z.object({ id: z.string().nullish() }).nullish(),
  recording: z.object({
    id: z.string().min(1),
    title: z.string().nullish(),
    description: z.string().nullish(),
    duration: z.number().nullish(),
    language: z.string().nullish(),
    createdAt: z.string().nullish(),
  }),
  summarizations: z.record(z.string(), summarization).nullish(),
  transcript: z.array(transcriptLine).nullish(),
});

export type PocketWebhookPayload = z.infer<typeof pocketWebhookSchema>;

/** What a given event should cause. */
export type PocketAction = "ingest" | "refresh" | "ignore";

export function actionForEvent(event: string): PocketAction {
  switch (event) {
    // Post-processing is done: summary, action items and tags all exist. This
    // is the delivery that should produce a meeting and read it.
    case "summary.completed":
    case "summary.regenerated":
      return "ingest";

    // The recording already landed here; these only change its text. Refresh
    // the body so the meeting matches what Pocket now holds, but don't re-run
    // the model — that would be an LLM call per edit, and the meeting page
    // already has "Propose again" for when a re-read is actually wanted.
    case "summary.updated":
    case "action_items.regenerated":
    case "transcript.edited":
    case "speakers.labeled":
    case "translation.completed":
      return "refresh";

    // Everything else is acknowledged and dropped:
    //
    // `recording.created` fires before there is anything worth reading, and
    // `transcription.completed` arrives without the summary — taking either
    // would file a thin meeting that a later delivery for the same recording
    // would have to fix anyway.
    //
    // `recording.deleted` is ignored ON PURPOSE. A meeting here can already
    // have accepted decisions, features and tickets hanging off it, and
    // deleting the audio in Pocket is not a decision to erase those. /meetings
    // has its own delete, behind a dialog that says exactly what will go.
    default:
      return "ignore";
  }
}

export interface PocketMeetingFields {
  title: string;
  meetingDate: Date;
  attendees: string[];
  body: string;
  /** False when the delivery carried no transcript and no summary text. */
  hasContent: boolean;
}

type Summarization = z.infer<typeof summarization>;

/**
 * Pick the summarization to use. `summarizations` is keyed by id and can hold
 * more than one, so prefer a completed one and fall back to the first.
 */
function pickSummarization(payload: PocketWebhookPayload): Summarization | null {
  const all = Object.values(payload.summarizations ?? {});
  if (all.length === 0) return null;
  return all.find((s) => s.processingStatus === "completed") ?? all[0] ?? null;
}

/**
 * Collapse Pocket's per-utterance segments into readable speaker turns.
 * Consecutive lines from one speaker become one paragraph — a transcript of
 * four-word fragments reads badly and costs more tokens to extract from.
 */
export function flattenTranscript(
  lines: PocketWebhookPayload["transcript"],
): string {
  const out: string[] = [];
  let speaker: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join(" ");
    out.push(speaker ? `${speaker}: ${text}` : text);
    buf = [];
  };

  for (const line of lines ?? []) {
    const text = line.text?.trim();
    if (!text) continue;
    const who = line.speaker?.trim() || null;
    if (who !== speaker) {
      flush();
      speaker = who;
    }
    buf.push(text);
  }
  flush();

  return out.join("\n\n");
}

/** Distinct speakers, in the order they first talk, original casing kept. */
export function speakersFrom(lines: PocketWebhookPayload["transcript"]): string[] {
  const seen = new Map<string, string>();
  for (const line of lines ?? []) {
    const who = line.speaker?.trim();
    if (!who) continue;
    const key = who.toLowerCase();
    if (!seen.has(key)) seen.set(key, who);
  }
  return [...seen.values()];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Turn a delivery into the fields of a Meeting row.
 *
 * The body carries Pocket's summary AND its action items AND the raw
 * transcript, because all three are input to `extractBrief`. Pocket's own
 * action items are included as material to read, not imported as records: they
 * have never been checked against the feature library or the ticket queue,
 * which is the entire job of the reviewer agent in
 * src/lib/meetings/review.ts.
 */
export function meetingFieldsFrom(payload: PocketWebhookPayload): PocketMeetingFields {
  const summary = pickSummarization(payload);
  const v2 = summary?.v2;

  const transcript = flattenTranscript(payload.transcript);
  const markdown = v2?.summary?.markdown?.trim() ?? "";
  const bullets = (v2?.summary?.bulletPoints ?? []).filter(Boolean);
  const actionItems = (v2?.actionItems?.actionItems ?? []).filter((a) => a.title?.trim());

  const sections: string[] = [];

  // Pocket's markdown usually arrives with its own headings ("## Key
  // Decisions"). Wrapping that in another one just nests headings for no
  // reason, so the label is only added when there isn't one already.
  if (markdown) {
    sections.push(markdown.startsWith("#") ? markdown : `## Summary\n\n${markdown}`);
  } else if (bullets.length > 0) {
    sections.push(`## Summary\n\n${bullets.map((b) => `- ${b}`).join("\n")}`);
  }

  if (actionItems.length > 0) {
    const lines = actionItems.map((a) => {
      const due = a.dueDate ? ` (due ${a.dueDate})` : "";
      return `- ${a.title!.trim()}${due}`;
    });
    sections.push(`## Action items flagged by Pocket\n\n${lines.join("\n")}`);
  }

  if (payload.recording.description?.trim()) {
    sections.push(`## Description\n\n${payload.recording.description.trim()}`);
  }

  if (transcript) sections.push(`## Transcript\n\n${transcript}`);

  const meetingDate =
    parseDate(payload.recording.createdAt) ??
    parseDate(summary?.createdAt) ??
    parseDate(payload.timestamp) ??
    new Date();

  const title =
    payload.recording.title?.trim() ||
    v2?.summary?.title?.trim() ||
    `Pocket recording ${meetingDate.toISOString().slice(0, 10)}`;

  return {
    title: title.slice(0, 300),
    meetingDate,
    attendees: speakersFrom(payload.transcript),
    body: sections.join("\n\n"),
    hasContent: Boolean(transcript || markdown || bullets.length || actionItems.length),
  };
}
