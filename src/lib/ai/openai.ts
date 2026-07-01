import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as { openai?: OpenAI };

export class OpenAIUnavailableError extends Error {
  constructor() {
    super(
      "OPENAI_API_KEY is not set. The in-app LLM and semantic wiki search are disabled. " +
        "Set OPENAI_API_KEY in your environment to enable.",
    );
    this.name = "OpenAIUnavailableError";
  }
}

export function isOpenAIAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAI(): OpenAI {
  if (globalForOpenAI.openai) return globalForOpenAI.openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIUnavailableError();
  const client = new OpenAI({ apiKey });
  if (process.env.NODE_ENV !== "production") globalForOpenAI.openai = client;
  return client;
}

export const CHAT_MODEL = "gpt-4o-mini";
export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;
