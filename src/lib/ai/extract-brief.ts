import { z } from "zod";

import { CHAT_MODEL, getOpenAI } from "./openai";

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

const SYSTEM_PROMPT = `You are the meeting analyst for NEO Labs' internal Product OS.
You read a raw meeting transcript or rough notes and turn them into a structured, scannable brief.

Return ONLY a single JSON object with EXACTLY this shape (no prose, no markdown):
{
  "tldr": "2-4 sentence plain-English summary a busy founder can scan in 30 seconds",
  "decisions": [{ "content": "a decision that was actually made", "owner": "person responsible or null" }],
  "featureSignals": [{ "title": "short feature name", "detail": "one line of context", "status": "NEW | ALREADY_TRACKED | SMALL_UNIQUE", "tags": ["short","tags"] }],
  "actionItems": [{ "content": "a concrete next step", "assignee": "person or null", "dueDate": "YYYY-MM-DD or null" }],
  "openQuestions": [{ "content": "an unresolved question raised but not answered" }]
}

Rules:
- featureSignals.status:
  - "NEW": a feature/idea the customer wants that is not obviously already built or planned.
  - "ALREADY_TRACKED": sounds like an existing or known capability the team likely already has.
  - "SMALL_UNIQUE": a niche, narrow, one-off request worth keeping so it isn't lost, but not a headline feature.
- Only use a concrete dueDate when a specific date is stated; otherwise null.
- Be concise. Do NOT invent decisions, features, owners, or dates that the transcript does not support.
- If a section has nothing, return an empty array. tldr must never be empty.`;

export async function extractBrief(transcript: string): Promise<ExtractedBrief> {
  const client = getOpenAI();
  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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
