import { toFile } from "openai";

import { CHAT_MODEL, getOpenAI } from "./openai";
import { getTranscribeCleanupPrompt } from "./prompts";

/**
 * Voice → text for the composer.
 *
 * Two steps on purpose. The speech model gives back what it heard, and a
 * second, deliberately narrow pass fixes what it obviously mis-heard, adds
 * punctuation and drops the filler. The second pass is not allowed to reason
 * about the content — the person is about to read and edit the result, and a
 * "helpful" rewrite would make them hunt for what changed. If the cleanup
 * fails for any reason the raw transcript is returned rather than nothing.
 */
export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

/** OpenAI's hard limit on an audio upload. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface Transcript {
  /** What the speech model heard, untouched. */
  raw: string;
  /** After the light pass. Empty when nothing intelligible was said. */
  text: string;
  /** Whether the light pass actually ran — false means `text === raw`. */
  cleaned: boolean;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

/** The upload needs a file name whose extension matches the container, or the
 *  API refuses it. Browsers send `audio/webm;codecs=opus` — strip the params. */
function fileNameFor(mimeType: string): { name: string; type: string } {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const ext = EXTENSION_BY_MIME[type] ?? "webm";
  return { name: `voice.${ext}`, type };
}

export async function transcribeAudio(
  bytes: Buffer | Uint8Array,
  mimeType: string,
): Promise<Transcript> {
  const client = getOpenAI();
  const { name, type } = fileNameFor(mimeType);

  const result = await client.audio.transcriptions.create({
    file: await toFile(bytes, name, { type }),
    model: TRANSCRIBE_MODEL,
    response_format: "json",
  });
  const raw = result.text.trim();
  if (!raw) return { raw, text: "", cleaned: false };

  try {
    const text = await cleanTranscript(raw);
    return { raw, text, cleaned: true };
  } catch (err) {
    console.warn("[transcribe] cleanup pass failed, returning raw transcript:", err);
    return { raw, text: raw, cleaned: false };
  }
}

async function cleanTranscript(raw: string): Promise<string> {
  const client = getOpenAI();
  const system = await getTranscribeCleanupPrompt();
  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: raw },
    ],
  });
  const out = res.choices[0]?.message?.content?.trim() ?? "";
  // A cleanup that comes back much shorter than what was said has summarised
  // or dropped something, which is exactly what it is not allowed to do. Trust
  // the ear over the editor in that case.
  if (out.length < raw.length * 0.5) return raw;
  return out;
}
