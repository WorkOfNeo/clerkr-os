"use server";

import { z } from "zod";

import { improvePrompt } from "@/lib/ai/improve-prompt";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { requireSession } from "@/lib/session";

// The composer's "Improve my prompt". Its own file for the same reason intake
// has one: it does a different job from sending a message, and it must never
// write anything — it only hands text back to the box.

const schema = z.object({
  text: z.string().max(20_000),
  mode: z.enum(["file", "ask"]),
});

export interface ImproveResponse {
  text: string;
  error?: string;
}

export async function improvePromptAction(
  input: z.infer<typeof schema>,
): Promise<ImproveResponse> {
  await requireSession();
  const parsed = schema.parse(input);

  if (!isOpenAIAvailable()) {
    return { text: parsed.text, error: "OPENAI_API_KEY is not set, so the prompt can't be improved." };
  }

  try {
    const text = await improvePrompt(parsed.text, parsed.mode);
    return { text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: parsed.text, error: `Couldn't improve the prompt: ${message}` };
  }
}
