import { db } from "@/lib/db";

import { CHAT_MODEL, getOpenAI, isOpenAIAvailable } from "./openai";

/**
 * Is this turn a question, or an instruction to file something?
 *
 * Ask mode's Copilot can only read. Left alone it answers "I can't add items
 * to the Kanban board" — which is false about the APP, only true about that
 * one code path, and reads as the assistant being useless. So before answering,
 * work out which of the two the user actually wants and route accordingly.
 *
 * It has to be a model call rather than keyword matching, because the trigger
 * is usually a fragment that only means anything in context: "yeah add it"
 * carries no verb worth matching and is unambiguous to a reader.
 */

const SYSTEM = `Decide what the user wants from their LAST message, given the conversation.

"create" — they want something recorded: a ticket, a card on a board, a note, a meeting, a feature. Includes short confirmations of a offer to create ("yes", "yeah add it", "do it", "go on then"), and includes requests phrased as questions ("could you add X?", "can we get a card for Y?").

"answer" — they want information: what exists, what's open, has this been reported, what did we decide, summarise this.

If the last message is a bare confirmation, look at what was being offered just before it. If they confirmed an offer to create something, that is "create".

Return ONLY: {"intent":"create"} or {"intent":"answer"}`;

export type Intent = "create" | "answer";

export async function detectIntent(params: {
  sessionId: string;
  userMessage: string;
}): Promise<Intent> {
  if (!isOpenAIAvailable()) return "answer";

  try {
    // A few turns of context, because the deciding message is often a fragment.
    const prior = await db.chatMessage.findMany({
      where: { sessionId: params.sessionId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { role: true, content: true },
    });

    const transcript = prior
      .reverse()
      .map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content.slice(0, 600)}`)
      .join("\n");

    const client = getOpenAI();
    const resp = await client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 20,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${transcript}\n\nUser's last message: ${params.userMessage}`,
        },
      ],
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
    return parsed.intent === "create" ? "create" : "answer";
  } catch (err) {
    // Answering is the safe default — it writes nothing.
    console.warn("[intent] detection failed, defaulting to answer:", err);
    return "answer";
  }
}
