// Seeds the working conventions of the app as a wiki note, so a fresh install
// explains itself. There is no taxonomy or starter sprint to seed any more —
// the work log has no columns to configure, and a thread only exists once
// you've actually decided something.
// Idempotent — every step is an upsert keyed on slug.
// Run: `npx prisma db seed` or `npm run db:seed`.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const HOW_IT_WORKS = `Clerkr OS is a work log, not a task board. Nothing here is planned up
front; everything is recorded as it happens.

## The loop

1. **You decide something.** Open a **thread** — a title, the call, and why.
2. **You do it.** As you go, log entries against the thread:
   - \`DECISION\` — a call you made and the reasoning behind it
   - \`WORKED\` — the right path, so you don't re-derive it
   - \`DEAD_END\` — a bad path: what you tried and why it failed
   - \`BLOCKER\` — what's stopping progress
   - \`IDEA\` — for later
   - \`QUESTION\` — open and unresolved
   - \`SHIPPED\` — it landed
3. **You close the thread.** The AI reads the whole stream, writes what came of
   it, and carries the surviving ideas into the Feature Library — deduped, so
   the same idea from two threads lands on one feature.

## Three ways in

- Type it at \`/log\`. ⌘↵ submits.
- Claude writes it during a session via the \`log_entry\` MCP tool.
- The Claude Code session-end hook harvests what you didn't log yourself. Those
  entries land marked "needs review" so an AI guess never quietly becomes fact.

## Why dead ends matter most

The point of the log is that you don't retry a path that already failed. Before
suggesting an approach, the Copilot searches \`DEAD_END\` entries. Write them with
the reason, not just the outcome.`;

async function main() {
  const noteAuthor = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!noteAuthor) {
    console.log("No User rows yet — sign in once, then re-run to seed the demo wiki note.");
    console.log("Done.");
    return;
  }

  console.log("Seeding 'How the work log works' wiki note…");
  const note = await db.wikiNote.upsert({
    where: { slug: "how-the-work-log-works" },
    update: { body: HOW_IT_WORKS },
    create: {
      slug: "how-the-work-log-works",
      title: "How the work log works",
      body: HOW_IT_WORKS,
      tags: ["convention", "work-log", "threads"],
      authorId: noteAuthor.id,
    },
  });

  if (process.env.OPENAI_API_KEY) {
    try {
      const { embedNote } = await import("../src/lib/ai/embed-wiki");
      await embedNote(note.id, note.title, note.body);
      console.log("  …embedded.");
    } catch (err) {
      console.warn("  …embedding failed (continuing):", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("  …skipped embedding (OPENAI_API_KEY not set); the sweep will pick it up.");
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
