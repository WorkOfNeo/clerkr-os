import { z } from "zod";

import type { PocketRecording } from "./client";

// Turning a Pocket recording into the fields of a Meeting row.
//
// Pocket's published schema documents `transcript` and `summarizations` only
// as `null` — their populated shapes are shown by example, not pinned down. So
// everything here is parsed defensively: both casings are accepted, both an
// array and a plain string are accepted for the transcript, and anything that
// doesn't parse is skipped rather than throwing. A recording that arrives in a
// shape we half-recognise should still become a readable meeting.

const transcriptLine = z.object({
  speaker: z.string().nullish(),
  speaker_name: z.string().nullish(),
  text: z.string().nullish(),
  content: z.string().nullish(),
  start: z.number().nullish(),
  end: z.number().nullish(),
});
type TranscriptLine = z.infer<typeof transcriptLine>;

const actionItem = z.object({
  title: z.string().nullish(),
  content: z.string().nullish(),
  dueDate: z.string().nullish(),
  due_date: z.string().nullish(),
});

const summaryBlock = z.object({
  title: z.string().nullish(),
  markdown: z.string().nullish(),
  bulletPoints: z.array(z.string()).nullish(),
  bullet_points: z.array(z.string()).nullish(),
});

const summarization = z.object({
  processingStatus: z.string().nullish(),
  processing_status: z.string().nullish(),
  createdAt: z.string().nullish(),
  created_at: z.string().nullish(),
  v2: z
    .object({
      summary: summaryBlock.nullish(),
      actionItems: z
        .object({ actionItems: z.array(actionItem).nullish() })
        .nullish(),
      action_items: z
        .object({ action_items: z.array(actionItem).nullish() })
        .nullish(),
    })
    .nullish(),
});
type Summarization = z.infer<typeof summarization>;

export interface PocketMeetingFields {
  title: string;
  meetingDate: Date;
  attendees: string[];
  body: string;
  /** False when the recording carried no transcript and no summary text. */
  hasContent: boolean;
}

function lineSpeaker(l: TranscriptLine): string | null {
  return (l.speaker ?? l.speaker_name)?.trim() || null;
}
function lineText(l: TranscriptLine): string {
  return (l.text ?? l.content ?? "").trim();
}

/** Accepts Pocket's segment array, or a transcript already flattened to text. */
function readTranscript(raw: unknown): TranscriptLine[] | string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (!Array.isArray(raw)) return null;
  const lines: TranscriptLine[] = [];
  for (const item of raw) {
    const parsed = transcriptLine.safeParse(item);
    if (parsed.success) lines.push(parsed.data);
  }
  return lines.length ? lines : null;
}

/**
 * Collapse per-utterance segments into readable speaker turns. Consecutive
 * lines from one speaker become one paragraph — a transcript of four-word
 * fragments reads badly and costs more tokens to extract from.
 */
export function flattenTranscript(lines: TranscriptLine[]): string {
  const out: string[] = [];
  let speaker: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join(" ");
    out.push(speaker ? `${speaker}: ${text}` : text);
    buf = [];
  };

  for (const line of lines) {
    const text = lineText(line);
    if (!text) continue;
    const who = lineSpeaker(line);
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
export function speakersFrom(lines: TranscriptLine[]): string[] {
  const seen = new Map<string, string>();
  for (const line of lines) {
    const who = lineSpeaker(line);
    if (!who) continue;
    const key = who.toLowerCase();
    if (!seen.has(key)) seen.set(key, who);
  }
  return [...seen.values()];
}

/** Pick a summarization: prefer a completed one, else the first that parses. */
function readSummarizations(raw: unknown): Summarization | null {
  if (!raw || typeof raw !== "object") return null;
  const candidates = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);

  const parsed: Summarization[] = [];
  for (const c of candidates) {
    const p = summarization.safeParse(c);
    if (p.success) parsed.push(p.data);
  }
  return (
    parsed.find((s) => (s.processingStatus ?? s.processing_status) === "completed") ??
    parsed[0] ??
    null
  );
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build the Meeting row's fields.
 *
 * The body carries Pocket's summary AND its action items AND the transcript,
 * because all three are input to `extractBrief`. Pocket's own action items go
 * in as material to READ, not imported as records: they have never been
 * checked against the feature library or the ticket queue, which is the whole
 * job of the reviewer agent in src/lib/meetings/review.ts.
 */
export function meetingFieldsFromRecording(rec: PocketRecording): PocketMeetingFields {
  const summary = readSummarizations(rec.summarizations);
  const v2 = summary?.v2;

  const parsedTranscript = readTranscript(rec.transcript);
  const lines = Array.isArray(parsedTranscript) ? parsedTranscript : [];
  const transcript =
    typeof parsedTranscript === "string" ? parsedTranscript : flattenTranscript(lines);

  const markdown = v2?.summary?.markdown?.trim() ?? "";
  const bullets = (v2?.summary?.bulletPoints ?? v2?.summary?.bullet_points ?? []).filter(Boolean);
  const rawActions = v2?.actionItems?.actionItems ?? v2?.action_items?.action_items ?? [];
  const actionItems = rawActions
    .map((a) => ({
      title: (a.title ?? a.content ?? "").trim(),
      due: (a.dueDate ?? a.due_date ?? "").trim(),
    }))
    .filter((a) => a.title);

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
    const rendered = actionItems.map((a) => `- ${a.title}${a.due ? ` (due ${a.due})` : ""}`);
    sections.push(`## Action items flagged by Pocket\n\n${rendered.join("\n")}`);
  }

  if (rec.description?.trim()) {
    sections.push(`## Description\n\n${rec.description.trim()}`);
  }

  if (transcript) sections.push(`## Transcript\n\n${transcript}`);

  const meetingDate =
    parseDate(rec.recording_at ?? rec.recordingAt) ??
    parseDate(rec.created_at ?? rec.createdAt) ??
    parseDate(summary?.createdAt ?? summary?.created_at) ??
    new Date();

  const title =
    rec.title?.trim() ||
    v2?.summary?.title?.trim() ||
    `Pocket recording ${meetingDate.toISOString().slice(0, 10)}`;

  // Whoever Pocket says recorded it is an attendee even if nobody was labelled
  // in the transcript, which is the common case for a one-to-one.
  const attendees = speakersFrom(lines);
  const recordedBy = rec.recorded_by?.display_name?.trim();
  if (recordedBy && !attendees.some((a) => a.toLowerCase() === recordedBy.toLowerCase())) {
    attendees.unshift(recordedBy);
  }

  return {
    title: title.slice(0, 300),
    meetingDate,
    attendees,
    body: sections.join("\n\n"),
    hasContent: Boolean(transcript || markdown || bullets.length || actionItems.length),
  };
}
