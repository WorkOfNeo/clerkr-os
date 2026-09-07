import { EMBED_DIMENSIONS, EMBED_MODEL, getOpenAI } from "./openai";

// text-embedding-3-small accepts 8191 tokens.
//
// This used to cut at 32k chars on the assumption of ~4 chars/token. That
// holds for tidy English prose and nothing else: Danish, names, timestamps
// and speaker labels all tokenise far denser — nearer 2 — so a long meeting
// sailed past 8191 tokens and OpenAI rejected it with
// `maximum context length is 8192 tokens`. Inside a best-effort `tryEmbed`
// wrapper that failure is swallowed, so the row simply stayed unsearchable
// and the sweep retried it forever. An 89k-char meeting sat unembedded in
// production because of it.
//
// 14k chars is under the limit even at ~1.7 chars/token. Losing the tail of a
// very long transcript costs far less than losing the whole embedding — and
// for a meeting the title and TL;DR, which carry the meaning, are at the
// front.
const MAX_CHARS = 14_000;

/** Recognise OpenAI's context-length rejection whatever shape it arrives in. */
function isTooLong(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /maximum context length|context_length_exceeded|too many tokens/i.test(message);
}

export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAI();

  // One retry at half length. The constant above should already be safe; this
  // is the belt to its braces, so a language that tokenises denser still than
  // Danish degrades to a shorter embedding rather than to none at all.
  let input = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await client.embeddings.create({ model: EMBED_MODEL, input });
      const vec = resp.data[0]?.embedding;
      if (!vec || vec.length !== EMBED_DIMENSIONS) {
        throw new Error(`Unexpected embedding shape from OpenAI (length ${vec?.length})`);
      }
      return vec;
    } catch (err) {
      if (attempt >= 1 || !isTooLong(err) || input.length < 1000) throw err;
      input = input.slice(0, Math.floor(input.length / 2));
    }
  }
}

export function toVectorLiteral(vec: number[]): string {
  // pgvector accepts the text form "[v1,v2,...]"; cast with ::vector at SQL time.
  return `[${vec.join(",")}]`;
}
