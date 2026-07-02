import { z } from "zod";

import { CHAT_MODEL, getOpenAI } from "./openai";
import { getMeetingPrompt } from "./prompts";

// The only OpenAI call site in the app that uses JSON mode. Existing calls
// (chat.ts, review-plan.ts) return plain text and are untouched.

export const SIGNAL_STATUSES = ["NEW", "ALREADY_TRACKED", "SMALL_UNIQUE"] as const;

export const extractedBriefSchema = z.object({
  tldr: z.string().min(1),
  decisions: z
    .array(
      z.object({
        content: z.string().min(1),
        owner: z.string().nullish(),
      }),
    )
    .default([]),
  featureSignals: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().nullish(),
        // `.catch` keeps a bad/missing status from failing the whole parse.
        status: z.enum(SIGNAL_STATUSES).catch("NEW"),
        tags: z.array(z.string()).default([]),
        cluster: z.string().nullish(), // product area — drives auto-clustering
      }),
    )
    .default([]),
  actionItems: z
    .array(
      z.object({
        content: z.string().min(1),
        assignee: z.string().nullish(),
        dueDate: z.string().nullish(), // ISO YYYY-MM-DD or null; coerced in the action
      }),
    )
    .default([]),
  openQuestions: z
    .array(z.object({ content: z.string().min(1) }))
    .default([]),
});

export type ExtractedBrief = z.infer<typeof extractedBriefSchema>;

export async function extractBrief(
  transcript: string,
  systemPrompt?: string,
): Promise<ExtractedBrief> {
  const client = getOpenAI();
  const prompt = systemPrompt ?? (await getMeetingPrompt());
  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: `Meeting transcript / notes:\n\n${transcript}` },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("The model did not return valid JSON. Try structuring again.");
  }
  return extractedBriefSchema.parse(json);
}
