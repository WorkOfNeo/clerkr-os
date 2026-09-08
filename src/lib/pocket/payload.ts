import { z } from "zod";

import type { PocketRecording } from "./client";

// Turning a Pocket recording into the fields of a Meeting row.
//
// Pocket's published schema documents `transcript` and `summarizations` only
// as `null`, and the ONE example in the webhook docs does not match what the
// REST API actually returns. Checked against a live recording, the real shapes
// are:
//
//   transcript: { metadata, segments: [{ speaker, text, originalText, start,
//                 end }], text }        ← an OBJECT, not the documented array
//   summarizations: { "<id>": { processingStatus, v2: {
//                 summary: { markdown, edited, editedAt, version },
//                 actionItems: { actions: [{ label, context, assignee,
//                                dueDate, priority, status }] } } } }
//
// The first of those cost us every transcript: reading only a string or an
// array meant a 25,000-character transcript parsed to nothing and the meeting
// stored the summary alone. The second silently dropped every action item,
// because the documented key is `actionItems.actionItems` and the real one is
// `actionItems.actions`.
//
// So: accept every shape seen or documented, prefer the real one, and never
// throw on an unfamiliar field.

const segment = z.object({
  speaker: z.string().nullish(),
  speaker_name: z.string().nullish(),
  text: z.string().nullish(),
  originalText: z.string().nullish(),
  content: z.string().nullish(),
  start: z.number().nullish(),
  end: z.number().nullish(),
});
type Segment = z.infer<typeof segment>;

const action = z.object({
  // The real API calls the one-line title `label`; the docs called it `title`.
  label: z.string().nullish(),
  title: z.string().nullish(),
  content: z.string().nullish(),
  context: z.string().nullish(),
  assignee: z.string().nullish(),
  dueDate: z.string().nullish(),
  due_date: z.string().nullish(),
  priority: z.string().nullish(),
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
        .object({
          actions: z.array(action).nullish(),
          actionItems: z.array(action).nullish(),
        })
        .nullish(),
      action_items: z
        .object({
          actions: z.array(action).nullish(),
          action_items: z.array(action).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
type Summarization = z.infer<typeof summarization>;

export interface PocketMeetingFields {
  title: string;
  meetingDate: Date;
  attendees: string[];
  /** Pocket's own summary and action items. Null when it produced none. */
  summary: string | null;
  /** What was actually said. Empty string when Pocket has no transcript yet. */
  transcript: string;
  hasContent: boolean;
}

function segSpeaker(s: Segment): string | null {
  return (s.speaker ?? s.speaker_name)?.trim() || null;
}
function segText(s: Segment): string {
  return (s.text ?? s.originalText ?? s.content ?? "").trim();
}

/**
 * Diarisation gives `SPEAKER_00` until somebody puts names to the voices in
 * Pocket. Those are worth keeping in the transcript — they still separate who
 * said what — but listing them as attendees is noise, so they are dropped
 * there.
 */
function isPlaceholderSpeaker(name: string): boolean {
  return /^speaker[\s_-]*\d+$/i.test(name.trim());
}

/**
 * Pull segments out of whatever `transcript` turned out to be: the real
 * object form, the documented array, or plain text.
 */
function readTranscript(raw: unknown): { segments: Segment[]; text: string | null } {
  if (!raw) return { segments: [], text: null };
  if (typeof raw === "string") return { segments: [], text: raw.trim() || null };

  if (Array.isArray(raw)) return { segments: parseSegments(raw), text: null };

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const segments = Array.isArray(obj.segments) ? parseSegments(obj.segments) : [];
    const text = typeof obj.text === "string" && obj.text.trim() ? obj.text.trim() : null;
    return { segments, text };
  }
  return { segments: [], text: null };
}

function parseSegments(items: unknown[]): Segment[] {
  const out: Segment[] = [];
  for (const item of items) {
    const parsed = segment.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Collapse per-utterance segments into readable speaker turns. Consecutive
 * lines from one speaker become one paragraph — a transcript of four-word
 * fragments reads badly and costs more tokens to extract from.
 */
export function flattenTranscript(segments: Segment[]): string {
  const out: string[] = [];
  let speaker: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join(" ");
    out.push(speaker ? `${speaker}: ${text}` : text);
    buf = [];
  };

  for (const seg of segments) {
    const text = segText(seg);
    if (!text) continue;
    const who = segSpeaker(seg);
    if (who !== speaker) {
      flush();
      speaker = who;
    }
    buf.push(text);
  }
  flush();

  return out.join("\n\n");
}

/** Named speakers, in the order they first talk. Diarisation labels omitted. */
export function speakersFrom(segments: Segment[]): string[] {
  const seen = new Map<string, string>();
  for (const seg of segments) {
    const who = segSpeaker(seg);
    if (!who || isPlaceholderSpeaker(who)) continue;
    const key = who.toLowerCase();
    if (!seen.has(key)) seen.set(key, who);
  }
  return [...seen.values()];
}

/** Prefer a completed summarization, else the first that parses. */
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
 * Summary and transcript are returned SEPARATELY rather than concatenated, so
 * the meeting page can show each on its own tab and the assistant can be asked
 * about the transcript when the summary got something wrong. Pocket's action
 * items ride with the summary — they are its reading of the conversation, not
 * part of what was said — and go in as material to READ, never imported as
 * records: they have never been checked against the feature library or the
 * ticket queue, which is the reviewer agent's whole job.
 */
export function meetingFieldsFromRecording(rec: PocketRecording): PocketMeetingFields {
  const sum = readSummarizations(rec.summarizations);
  const v2 = sum?.v2;

  const { segments, text } = readTranscript(rec.transcript);
  // Segments carry who said what, so they win over the flat `text` blob.
  const transcript = segments.length > 0 ? flattenTranscript(segments) : (text ?? "");

  const markdown = v2?.summary?.markdown?.trim() ?? "";
  const bullets = (v2?.summary?.bulletPoints ?? v2?.summary?.bullet_points ?? []).filter(Boolean);

  const rawActions =
    v2?.actionItems?.actions ??
    v2?.actionItems?.actionItems ??
    v2?.action_items?.actions ??
    v2?.action_items?.action_items ??
    [];
  const actionItems = rawActions
    .map((a) => ({
      title: (a.label ?? a.title ?? a.content ?? "").trim(),
      detail: (a.context ?? "").trim(),
      assignee: (a.assignee ?? "").trim(),
      due: (a.dueDate ?? a.due_date ?? "").trim(),
    }))
    .filter((a) => a.title);

  const summaryParts: string[] = [];
  if (markdown) {
    // Pocket's markdown arrives with its own headings; wrapping it in another
    // one just nests headings for no reason.
    summaryParts.push(markdown.startsWith("#") ? markdown : `## Summary\n\n${markdown}`);
  } else if (bullets.length > 0) {
    summaryParts.push(`## Summary\n\n${bullets.map((b) => `- ${b}`).join("\n")}`);
  }

  if (actionItems.length > 0) {
    const rendered = actionItems.map((a) => {
      const meta = [a.assignee && a.assignee !== "me" ? a.assignee : null, a.due ? `due ${a.due}` : null]
        .filter(Boolean)
        .join(", ");
      const head = `- ${a.title}${meta ? ` (${meta})` : ""}`;
      return a.detail ? `${head}\n  ${a.detail}` : head;
    });
    summaryParts.push(`## Action items flagged by Pocket\n\n${rendered.join("\n")}`);
  }

  if (rec.description?.trim()) {
    summaryParts.push(`## Description\n\n${rec.description.trim()}`);
  }

  const meetingDate =
    parseDate(rec.recording_at ?? rec.recordingAt) ??
    parseDate(rec.created_at ?? rec.createdAt) ??
    parseDate(sum?.createdAt ?? sum?.created_at) ??
    new Date();

  const title =
    rec.title?.trim() ||
    v2?.summary?.title?.trim() ||
    `Pocket recording ${meetingDate.toISOString().slice(0, 10)}`;

  const attendees = speakersFrom(segments);
  const recordedBy = rec.recorded_by?.display_name?.trim();
  if (recordedBy && !attendees.some((a) => a.toLowerCase() === recordedBy.toLowerCase())) {
    attendees.unshift(recordedBy);
  }

  return {
    title: title.slice(0, 300),
    meetingDate,
    attendees,
    summary: summaryParts.length ? summaryParts.join("\n\n") : null,
    transcript,
    hasContent: Boolean(transcript || summaryParts.length),
  };
}
