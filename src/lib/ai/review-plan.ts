import { db } from "@/lib/db";

import { CHAT_MODEL, getOpenAI } from "./openai";
import { semanticSearchWiki, type SemanticSearchResult } from "./wiki-search";

export interface ReviewPlanResult {
  sessionId: string;
  critique: string;
}

export async function reviewSprintPlan(
  sprintId: string,
  userId: string,
): Promise<ReviewPlanResult> {
  const sprint = await db.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
        where: { archivedAt: null },
        include: {
          status: true,
          assignees: { include: { user: { select: { name: true, email: true } } } },
          blockedBy: { include: { blocker: { select: { name: true, slug: true } } } },
        },
        orderBy: [{ statusId: "asc" }, { order: "asc" }],
      },
    },
  });
  if (!sprint) throw new Error(`Sprint not found: ${sprintId}`);

  const taskSummary = sprint.tasks
    .map((t) => {
      const assignees = t.assignees.map((a) => a.user.email.split("@")[0]).join(", ");
      const blockers = t.blockedBy.map((b) => b.blocker.name).join("; ");
      const est = t.estimatedHours ? `${t.estimatedHours.toString()}h est` : null;
      const parts = [`- [${t.status.label}] ${t.name}`];
      if (assignees) parts.push(`@${assignees}`);
      if (est) parts.push(est);
      if (blockers) parts.push(`blocked by: ${blockers}`);
      return parts.join(" · ");
    })
    .join("\n");

  const searchQuery = [sprint.name, sprint.goal, ...sprint.tasks.map((t) => t.name)]
    .filter(Boolean)
    .join(" ");

  let notes: SemanticSearchResult[] = [];
  try {
    notes = await semanticSearchWiki(searchQuery, { limit: 5 });
  } catch (err) {
    console.warn("[review-plan] semanticSearchWiki failed:", err);
  }

  const noteContext = notes.length
    ? notes
        .map((n, i) => `[${i + 1}] ${n.title}\n${n.body.slice(0, 800)}`)
        .join("\n\n")
    : "(no relevant prior wiki notes)";

  const testingDays = [sprint.testingDay1, sprint.testingDay2, sprint.testingDay3]
    .filter((d): d is Date => d != null)
    .map((d) => d.toISOString().slice(0, 10))
    .join(", ");

  const systemPrompt =
    "You are reviewing a two-week sprint plan for an internal team. " +
    "Sprint convention: first Thursday + next-week Wed & Fri are testing days. " +
    "Look for: realistic scope vs. the testing days, unaddressed dependencies, missing owners, " +
    "and risks visible from prior wiki notes. Be honest but constructive. Reference notes by index.";

  const userPrompt =
    `Sprint: ${sprint.name}\n` +
    `Dates: ${sprint.startDate.toISOString().slice(0, 10)} → ${sprint.endDate
      .toISOString()
      .slice(0, 10)}\n` +
    `Goal: ${sprint.goal ?? "(no goal set)"}\n` +
    `Testing days: ${testingDays || "(not set)"}\n\n` +
    `Tasks (${sprint.tasks.length}):\n${taskSummary || "(none)"}\n\n` +
    `Relevant prior wiki notes:\n${noteContext}\n\n` +
    `Please critique this plan.`;

  const client = getOpenAI();
  const resp = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
  });
  const critique = resp.choices[0]?.message?.content ?? "";

  const session = await db.chatSession.create({
    data: {
      title: `Plan review: ${sprint.name}`,
      userId,
      sprintId: sprint.id,
      messages: {
        create: [
          { role: "USER", content: userPrompt },
          {
            role: "ASSISTANT",
            content: critique,
            citedNoteIds: notes.map((n) => n.id),
          },
        ],
      },
    },
  });

  return { sessionId: session.id, critique };
}
