import { EMBED_DIMENSIONS, EMBED_MODEL, getOpenAI } from "./openai";

// text-embedding-3-small accepts up to 8191 tokens. Truncate conservatively
// at ~32k chars (≈ 4 chars/token) so we never bounce against the limit.
const MAX_CHARS = 32_000;

export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAI();
  const input = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const resp = await client.embeddings.create({
    model: EMBED_MODEL,
    input,
  });
  const vec = resp.data[0]?.embedding;
  if (!vec || vec.length !== EMBED_DIMENSIONS) {
    throw new Error(`Unexpected embedding shape from OpenAI (length ${vec?.length})`);
  }
  return vec;
}

export function toVectorLiteral(vec: number[]): string {
  // pgvector accepts the text form "[v1,v2,...]"; cast with ::vector at SQL time.
  return `[${vec.join(",")}]`;
}
