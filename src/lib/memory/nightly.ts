import { db } from "@/lib/db";

import { CHAT_MODEL, getOpenAI, isOpenAIAvailable } from "@/lib/ai/openai";

/**
 * The nightly pass: read the day's conversations and work out what is worth
 * remembering.
 *
 * It only ever PROPOSES. Nothing it writes reaches a prompt until a person
 * confirms it at /memory — an assistant that silently rewrites its own
 * instructions from a misread sentence is worse than one that forgets.
 *
 * It is also shown what it already knows, including what was DISMISSED, so it
 * stops re-suggesting the same thing every night. That is the difference
 * between a memory that settles and one that nags.
 */

/** A little over a day, so a late night isn't missed by a pass at 3am. */
const DEFAULT_LOOKBACK_HOURS = 26;

const SYSTEM = `You review a day of conversation between a user and their internal Product OS assistant, and decide what is worth REMEMBERING for next time.

You are looking for durable things, not events. "Neo filed three bugs today" is an event and worthless. "Neo wants bug titles to name the symptom, not the guessed cause" is durable and worth keeping.

Signals worth a memory:
- The user corrected the assistant, or restated something it got wrong.
- The user expressed a preference about how work should be done or presented.
- A convention was established: naming, where something belongs, what a status means.
- A durable fact about the product, stack or a client came up.
- The user routed something ("that's a wiki note, not a ticket") — that is a routing rule.

Do NOT propose:
- One-off task content. The ticket already holds it.
- Anything already covered by what you are told is known below.
- Anything you are only guessing at. Fewer, better memories.

Return ONLY a JSON object:
{
  "memories": [
    {
      "category": "PREFERENCE | CONVENTION | FACT | CORRECTION | ROUTING",
      "title": "one short line, how it appears in a list",
      "content": "the instruction as the assistant should read it next time, in the imperative",
      "sourceNote": "one sentence: what in the conversation led to this"
    }
  ]
}

If nothing durable came up, return an empty array. That is the normal result on most days.`;

export interface NightlyResult {
  scannedMessages: number;
  proposed: number;
  skipped: number;
  /**
   * Why nothing happened, when nothing happened. Without this, "OpenAI isn't
   * configured" and "there was nothing to learn" both surface as zero, and the
   * button looks broken in one case and idle in the other.
   */
  skippedReason?: "no-openai" | "no-conversation";
}

export async function runNightlyMemoryPass(
  opts: { lookbackHours?: number } = {},
): Promise<NightlyResult> {
  if (!isOpenAIAvailable()) {
    return { scannedMessages: 0, proposed: 0, skipped: 0, skippedReason: "no-openai" };
  }

  const since = new Date(
    Date.now() - (opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS) * 60 * 60 * 1000,
  );
  const messages = await db.chatMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: { id: true, role: true, content: true },
  });
  if (messages.length < 2) {
    return {
      scannedMessages: messages.length,
      proposed: 0,
      skipped: 0,
      skippedReason: "no-conversation",
    };
  }

  // Everything already decided — active AND dismissed. Without the dismissed
  // ones it re-proposes what was already rejected, every single night.
  const known = await db.memory.findMany({
    where: { status: { in: ["ACTIVE", "DISMISSED"] } },
    select: { status: true, title: true, content: true },
    take: 200,
  });

  const knownBlock = known.length
    ? "ALREADY DECIDED — do not propose these again:\n" +
      known.map((k) => `- [${k.status}] ${k.title}: ${k.content}`).join("\n")
    : "Nothing has been decided yet.";

  const transcript = messages
    .map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content.slice(0, 1200)}`)
    .join("\n\n");

  const client = getOpenAI();
  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: `${SYSTEM}\n\n${knownBlock}` },
      { role: "user", content: transcript },
    ],
  });

  let parsed: { memories?: { category?: string; title?: string; content?: string; sourceNote?: string }[] };
  try {
    parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  } catch {
    return { scannedMessages: messages.length, proposed: 0, skipped: 0 };
  }

  const CATEGORIES = ["PREFERENCE", "CONVENTION", "FACT", "CORRECTION", "ROUTING"];
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  let proposed = 0;
  let skipped = 0;

  for (const m of (parsed.memories ?? []).slice(0, 10)) {
    const category = String(m.category ?? "").toUpperCase();
    const title = String(m.title ?? "").trim();
    const content = String(m.content ?? "").trim();
    if (!CATEGORIES.includes(category) || !title || !content) {
      skipped++;
      continue;
    }

    // Cheap near-duplicate guard on top of what the prompt was told: the same
    // title in any state means this has already been considered.
    const existing = await db.memory.findFirst({
      where: { title: { equals: title, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await db.memory.create({
      data: {
        category: category as never,
        status: "PROPOSED",
        title: title.slice(0, 200),
        content,
        sourceNote: m.sourceNote?.slice(0, 500) ?? null,
        sourceMessageId: lastMessageId,
      },
    });
    proposed++;
  }

  if (proposed > 0) {
    await db.notification.createMany({
      data: [
        {
          kind: "MEMORY_PROPOSED",
          title: `${proposed} thing${proposed === 1 ? "" : "s"} worth remembering`,
          body: "From yesterday's conversations. Confirm or dismiss them.",
          href: "/memory",
          dedupeKey: `memory-proposed:${new Date().toISOString().slice(0, 10)}`,
        },
      ],
      skipDuplicates: true,
    });
  }

  return { scannedMessages: messages.length, proposed, skipped };
}
