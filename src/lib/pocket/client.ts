import { z } from "zod";

// Thin client for Pocket's personal Public API.
// https://docs.heypocketai.com/docs/api
//
// The reason this exists rather than a webhook: `GET /public/recordings`
// returns METADATA ONLY — `transcript` and `summarizations` come back null —
// and it filters server-side on `tag_ids`. So we can find out what is worth
// importing without a single word of any conversation leaving Pocket, and
// only ever fetch the full text of a recording somebody has decided belongs
// here. A webhook cannot offer that: it pushes everything and lets us sort it
// out afterwards, by which point another client's meeting is already sitting
// on this server.

const BASE = "https://public.heypocketai.com/api/v1";

/** Pocket wraps every response as { data, success }. */
function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data: data.nullish(),
    success: z.boolean().nullish(),
    error: z.string().nullish(),
    pagination: z
      .object({
        page: z.number().nullish(),
        limit: z.number().nullish(),
        total: z.number().nullish(),
        total_pages: z.number().nullish(),
        has_more: z.boolean().nullish(),
      })
      .nullish(),
  });
}

export const pocketTagSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  color: z.string().nullish(),
});
export type PocketTag = z.infer<typeof pocketTagSchema>;

/**
 * A recording as the API returns it. Loose on purpose — the same reasoning as
 * the payload schema: an added field must never start rejecting recordings.
 *
 * Note the casing. The REST API is snake_case (`created_at`, `recording_at`)
 * where the webhook payload was camelCase, and the nested transcript and
 * summarization objects are not pinned down in Pocket's published schema —
 * both are documented only as `null` in the list response. So both spellings
 * are accepted everywhere it matters and the normaliser reads whichever
 * turned up.
 */
export const pocketRecordingSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  duration: z.number().nullish(),
  language: z.string().nullish(),
  state: z.string().nullish(),
  folder_id: z.string().nullish(),
  created_at: z.string().nullish(),
  createdAt: z.string().nullish(),
  recording_at: z.string().nullish(),
  recordingAt: z.string().nullish(),
  updated_at: z.string().nullish(),
  recorded_by: z
    .object({
      display_name: z.string().nullish(),
      email: z.string().nullish(),
      user_id: z.string().nullish(),
    })
    .nullish(),
  tags: z.array(pocketTagSchema).nullish(),
  transcript: z.unknown().nullish(),
  summarizations: z.unknown().nullish(),
  transcript_error: z.string().nullish(),
  summarizations_errors: z.array(z.string()).nullish(),
});
export type PocketRecording = z.infer<typeof pocketRecordingSchema>;

export class PocketApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PocketApiError";
  }
}

async function call<T extends z.ZodTypeAny>(
  apiKey: string,
  path: string,
  schema: T,
  params?: Record<string, string | number | undefined>,
): Promise<z.infer<T> | null> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      // Never cache — a poll that reads a stale list imports nothing new.
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new PocketApiError(
      `Could not reach Pocket: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // 401 is the one worth naming — it is the whole of "your key is wrong",
    // and it is what someone will actually hit while setting this up.
    const hint =
      res.status === 401
        ? "Pocket rejected the API key. Check it starts with pk_ and hasn't been revoked."
        : text.slice(0, 300);
    throw new PocketApiError(hint, res.status);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new PocketApiError("Pocket returned a response that wasn't JSON.", res.status);
  }

  const parsed = envelope(schema).safeParse(parsedJson);
  if (!parsed.success) {
    throw new PocketApiError("Pocket returned a shape we don't recognise.", res.status);
  }
  if (parsed.data.error) throw new PocketApiError(parsed.data.error, res.status);

  return (parsed.data.data ?? null) as z.infer<T> | null;
}

/** Tags on the account, so setup can offer a list instead of asking for an id. */
export async function listTags(apiKey: string): Promise<PocketTag[]> {
  const data = await call(apiKey, "/public/tags", z.array(pocketTagSchema), { limit: 100 });
  return data ?? [];
}

export interface ListOptions {
  /** Pocket filters on whole UTC days. */
  startDate?: string;
  endDate?: string;
  /** Server-side filter. Nothing outside these tags is even returned. */
  tagIds?: string[];
  page?: number;
  limit?: number;
}

/**
 * Recent recordings, METADATA ONLY — Pocket returns `transcript` and
 * `summarizations` as null here, which is what makes browsing safe.
 */
export async function listRecordings(
  apiKey: string,
  opts: ListOptions = {},
): Promise<PocketRecording[]> {
  const data = await call(apiKey, "/public/recordings", z.array(pocketRecordingSchema), {
    start_date: opts.startDate,
    end_date: opts.endDate,
    tag_ids: opts.tagIds?.length ? opts.tagIds.join(",") : undefined,
    page: opts.page ?? 1,
    limit: opts.limit ?? 50,
  });
  return data ?? [];
}

/** One recording WITH its transcript and summary. The only call that moves content. */
export async function getRecording(
  apiKey: string,
  recordingId: string,
): Promise<PocketRecording | null> {
  return call(
    apiKey,
    `/public/recordings/${encodeURIComponent(recordingId)}`,
    pocketRecordingSchema,
    { include_transcript: "true" },
  );
}

/** Cheap credential check for the settings form. */
export async function verifyApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await listRecordings(apiKey, { limit: 1 });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof PocketApiError ? err.message : "Could not reach Pocket.",
    };
  }
}
