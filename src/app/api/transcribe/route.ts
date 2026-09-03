import { isOpenAIAvailable } from "@/lib/ai/openai";
import { MAX_AUDIO_BYTES, transcribeAudio } from "@/lib/ai/transcribe";
import { getSession } from "@/lib/session";

// Voice → text. A route handler rather than a server action for the same
// reason document upload is one: the body is a binary blob, and a server
// action would carry it base64'd inside the RSC payload, a third bigger and
// capped by `serverActions.bodySizeLimit`. Nothing is written — the transcript
// goes back to the composer for the person to read, edit and send themselves.
//
// Session-gated like /api/attachments: this is deliberately NOT in the
// src/proxy.ts public allowlist, and the check below is belt-and-braces for a
// fetch that arrives without a cookie.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return json({ error: "Unauthorized" }, 401);

  if (!isOpenAIAvailable()) {
    return json({ error: "OPENAI_API_KEY is not set, so voice input is disabled." }, 503);
  }

  const mimeType = req.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("audio/")) {
    return json({ error: "Expected an audio body." }, 415);
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: "Empty recording." }, 400);
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return json({ error: "Recording is too long to transcribe in one go." }, 413);
  }

  try {
    const transcript = await transcribeAudio(bytes, mimeType);
    return json(transcript, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] failed:", err);
    return json({ error: `Transcription failed: ${message}` }, 502);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
