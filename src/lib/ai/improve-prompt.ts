import { loadVocabulary, vocabularyBlock } from "./intake";
import { CHAT_MODEL, getOpenAI } from "./openai";
import { getImprovePrompt } from "./prompts";

/**
 * "Improve my prompt" on the composer.
 *
 * Takes whatever is in the box and rewrites it so it lands well on the surface
 * it is about to be sent to — the intake classifier or the Copilot. It knows
 * what those two want (the prompt in prompts.ts) and what already exists (the
 * same vocabulary block intake itself is given), so it can nudge a draft
 * toward a category or a ticket number when the draft is plainly about it.
 *
 * It must be safe to press on ANY input. Every failure path returns the
 * original text rather than something worse than what the person typed.
 */
export type ImproveMode = "file" | "ask";

export async function improvePrompt(text: string, mode: ImproveMode): Promise<string> {
  const draft = text.trim();
  if (!draft) return text;

  const client = getOpenAI();
  const [base, vocab] = await Promise.all([getImprovePrompt(mode), loadVocabulary()]);
  const system = `${base}\n\n${vocabularyBlock(vocab)}`;

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: draft },
    ],
  });

  const out = stripWrapping(res.choices[0]?.message?.content ?? "");
  if (!out) return text;
  // A result far shorter than the draft has lost something. A result far
  // longer has invented something. Either way the draft was better.
  if (out.length < draft.length * 0.4 || out.length > draft.length * 3 + 400) return text;
  return out;
}

/** Models love to hand back the text inside a code fence or quotes despite
 *  being told not to. Peel one layer if it is there. */
function stripWrapping(s: string): string {
  let t = s.trim();
  const fence = t.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) t = fence[1].trim();
  if (t.length > 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  return t;
}
