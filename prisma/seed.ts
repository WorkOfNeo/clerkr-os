// Seeds the default ticket categories, the founding superadmins, and a wiki
// note explaining how the ticket queue works. Idempotent — categories are
// upserted on slug, so a renamed label survives a re-seed and re-running never
// duplicates.
// Run: `npx prisma db seed` or `npm run db:seed`.

import { PrismaClient } from "@prisma/client";

import { DEFAULT_CATEGORIES } from "../src/lib/ticket-meta";

const db = new PrismaClient();

// The people who set this workspace up. Overridable with SUPERADMIN_EMAILS.
const DEFAULT_SUPERADMINS = "yaw@clerkr.ai,niels@clerkr.ai,patrick@clerkr.ai";

const HOW_IT_WORKS = `Clerkr OS keeps the ticket queue that used to live in a Google Doc.

## The loop

1. **Something gets raised** — an idea, a bug, a feature request, an open
   question. By you at \`/tickets\`, by a teammate, or by Claude through the MCP
   server while you're working.
2. **You comment on it** as you dig in — what you found, what you changed.
   Screenshots paste straight in with ⌘V (macOS) or Ctrl+V (Windows); drag-drop
   and the file picker work too.
3. **You mark it** \`Fixed\` when it's done in code, \`Shipped\` once it's out, or
   \`Won't fix\` when you've deliberately decided against it. The list defaults to
   what's still open, so closed tickets get out of your way.

## Categories are yours to change

Idea / Bug / Feature request / Question are just the seeded defaults. Add,
rename or recolour them at \`/settings/categories\` — no deploy needed. Deleting a
category leaves its tickets alone; they simply become uncategorised.

## Working with Claude

Claude has MCP tools for the whole queue: \`create_ticket\`, \`search_tickets\`,
\`comment_on_ticket\`, \`update_ticket\`, \`list_tickets\`. Ask it to file what you just
hit, or to check whether something has already been reported — \`search_tickets\`
is semantic, so it finds duplicates by meaning rather than exact wording.`;

async function main() {
  console.log("Seeding ticket categories…");
  for (const c of DEFAULT_CATEGORIES) {
    await db.ticketCategory.upsert({
      where: { slug: c.slug },
      // Don't clobber a label or colour that's been customised — only ensure
      // the row exists and keep its position.
      update: { sortOrder: c.sortOrder },
      create: { ...c },
    });
    console.log(`  ${c.label}`);
  }

  // Bootstrap superadmins. Only ever PROMOTES — a demotion made at /admin is a
  // decision, and a re-seed must not quietly undo it. Which addresses these are
  // is a deploy-time fact, so it lives in an env var like ALLOWED_EMAILS does;
  // after the first promotion /admin is the place to change a role.
  const superadmins = (process.env.SUPERADMIN_EMAILS ?? DEFAULT_SUPERADMINS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (superadmins.length > 0) {
    console.log("Promoting superadmins…");
    const existing = await db.user.findMany({
      where: { email: { in: superadmins } },
      select: { email: true },
    });
    const promoted = await db.user.updateMany({
      where: { email: { in: superadmins }, role: "MEMBER" },
      data: { role: "SUPERADMIN" },
    });
    console.log(`  ${promoted.count} promoted, ${existing.length - promoted.count} already superadmin`);
    for (const email of superadmins) {
      if (!existing.some((u) => u.email === email)) {
        console.log(`  ${email} has no account yet — re-run after they sign up.`);
      }
    }
  }

  const noteAuthor = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!noteAuthor) {
    console.log("No User rows yet — sign in once, then re-run to seed the wiki note.");
    console.log("Done.");
    return;
  }

  console.log("Seeding 'How tickets work' wiki note…");
  const note = await db.wikiNote.upsert({
    where: { slug: "how-tickets-work" },
    update: { body: HOW_IT_WORKS },
    create: {
      slug: "how-tickets-work",
      title: "How tickets work",
      body: HOW_IT_WORKS,
      tags: ["convention", "tickets"],
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
