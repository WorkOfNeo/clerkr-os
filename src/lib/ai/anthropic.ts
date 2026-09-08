import Anthropic from "@anthropic-ai/sdk";

// Claude, alongside the OpenAI client rather than replacing it: embeddings and
// the older chat surfaces still go through OpenAI, and the meeting Q&A goes
// here. Same singleton-on-globalThis shape as openai.ts so dev hot-reload
// doesn't open a new client per edit, and the same "absent key degrades, never
// crashes" contract.

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

export class AnthropicUnavailableError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Asking questions about a meeting is disabled. " +
        "Set ANTHROPIC_API_KEY in your environment to enable.",
    );
    this.name = "AnthropicUnavailableError";
  }
}

export function isAnthropicAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  if (globalForAnthropic.anthropic) return globalForAnthropic.anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AnthropicUnavailableError();
  const client = new Anthropic({ apiKey });
  if (process.env.NODE_ENV !== "production") globalForAnthropic.anthropic = client;
  return client;
}

export const CLAUDE_MODEL = "claude-opus-5";
export const CLAUDE_MAX_TOKENS = 16_000;
