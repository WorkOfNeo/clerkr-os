// Seed default taxonomy + a starter sprint + a demo wiki note.
// Idempotent — every step is an upsert keyed on slug/label.
// Run: `npx prisma db seed` or `npm run db:seed`.

import { PrismaClient } from "@prisma/client";

import { computeSprintDates, defaultPlanningDate } from "../src/lib/sprint-dates";

const db = new PrismaClient();

const STATUSES = [
  { label: "To do", color: "#94a3b8", sortOrder: 0, isDone: false },
  { label: "In progress", color: "#3b82f6", sortOrder: 1, isDone: false },
  { label: "Stuck", color: "#ef4444", sortOrder: 2, isDone: false },
  { label: "In review", color: "#a855f7", sortOrder: 3, isDone: false },
  { label: "Done", color: "#10b981", sortOrder: 4, isDone: true },
];

const GROUPS = [
  { label: "Development", color: "#3b82f6", sortOrder: 0 },
  { label: "Marketing", color: "#f59e0b", sortOrder: 1 },
  { label: "Website", color: "#10b981", sortOrder: 2 },
];

async function main() {
  console.log("Seeding TaskStatus…");
  for (const s of STATUSES) {
    await db.taskStatus.upsert({
      where: { label: s.label },
      update: { color: s.color, sortOrder: s.sortOrder, isDone: s.isDone },
      create: s,
    });
  }

  console.log("Seeding TaskGroup…");
  for (const g of GROUPS) {
    await db.taskGroup.upsert({
      where: { label: g.label },
      update: { color: g.color, sortOrder: g.sortOrder },
      create: g,
    });
  }

  console.log("Skipping TaskStack (intentionally empty — added as you learn).");

  // Starter sprint, anchored on the upcoming Monday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToMon = (1 - today.getDay() + 7) % 7 || 7; // next Mon (not today)
  const startDate = new Date(today.getTime() + daysToMon * 24 * 60 * 60 * 1000);
  const dates = computeSprintDates(startDate);

  console.log("Seeding starter sprint…");
  await db.sprint.upsert({
    where: { slug: "sprint-1" },
    update: {},
    create: {
      name: "Sprint 1",
      slug: "sprint-1",
      state: "ACTIVE",
      startDate,
      endDate: dates.endDate,
      planningDate: defaultPlanningDate(startDate),
      testingDay1: dates.testingDay1,
      testingDay2: dates.testingDay2,
      testingDay3: dates.testingDay3,
      goal: "Land the sprint board, MCP, and in-app LLM. Test on Thursday + week-2 Wed/Fri.",
    },
  });

  // Demo wiki note — embed if OPENAI_API_KEY is set, otherwise leave unembedded.
  const noteAuthor = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!noteAuthor) {
    console.log("No User rows yet — skipping demo wiki note. Sign in once, then re-run.");
  } else {
    console.log("Seeding demo wiki note…");
    const note = await db.wikiNote.upsert({
      where: { slug: "two-week-sprint-convention" },
      update: {},
      create: {
        slug: "two-week-sprint-convention",
        title: "Two-week sprint convention",
        body:
          "Sprints run for two calendar weeks (14 days). Testing days are:\n\n" +
          "1. **Day 1 (Thursday, week 1)** — first round of testing on landed work.\n" +
          "2. **Day 2 (Wednesday, week 2)** — second pass; tighter scope.\n" +
          "3. **Day 3 (Friday, week 2)** — final pass before the sprint closes.\n\n" +
          "Planning happens the Monday before the sprint starts. Retros at sprint close " +
          "should capture any decision or learning that future plans should know about — " +
          "save those as wiki notes tagged with the sprint slug.",
        tags: ["convention", "sprint"],
        authorId: noteAuthor.id,
      },
    });

    if (process.env.OPENAI_API_KEY && !note.embeddedAt) {
      try {
        const { embedNote } = await import("../src/lib/ai/embed-wiki");
        await embedNote(note.id, note.title, note.body);
        console.log("  …embedded.");
      } catch (err) {
        console.warn("  …embedding failed (continuing):", err instanceof Error ? err.message : err);
      }
    } else if (!process.env.OPENAI_API_KEY) {
      console.log("  …skipped embedding (OPENAI_API_KEY not set).");
    }
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
