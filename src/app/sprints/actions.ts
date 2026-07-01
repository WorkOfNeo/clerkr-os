"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { reviewSprintPlan as runReviewSprintPlan } from "@/lib/ai/review-plan";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";
import { computeSprintDates, defaultPlanningDate } from "@/lib/sprint-dates";

const createSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  goal: z.string().optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  planningDate: z.string().optional().nullable(),
  testingDay1: z.string().optional().nullable(),
  testingDay2: z.string().optional().nullable(),
  testingDay3: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  state: z.enum(["PLANNED", "ACTIVE", "CLOSED"]).optional(),
});

function dateOrNull(v: string | undefined | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function createSprint(formData: FormData) {
  await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const input = createSchema.parse(raw);

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) throw new Error("Invalid startDate");
  const dates = computeSprintDates(startDate);

  const slug = await uniqueSlug(slugify(input.name), async (s) =>
    Boolean(await db.sprint.findUnique({ where: { slug: s }, select: { id: true } })),
  );

  const sprint = await db.sprint.create({
    data: {
      name: input.name,
      slug,
      state: "PLANNED",
      startDate,
      endDate: dates.endDate,
      planningDate: defaultPlanningDate(startDate),
      testingDay1: dates.testingDay1,
      testingDay2: dates.testingDay2,
      testingDay3: dates.testingDay3,
      goal: input.goal || null,
    },
  });

  revalidatePath("/sprints");
  revalidatePath("/tasks");
  redirect(`/sprints/${sprint.slug}`);
}

export async function updateSprint(formData: FormData) {
  await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const input = updateSchema.parse(raw);

  const sprint = await db.sprint.update({
    where: { id: input.id },
    data: {
      name: input.name,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      planningDate: dateOrNull(input.planningDate ?? null),
      testingDay1: dateOrNull(input.testingDay1 ?? null),
      testingDay2: dateOrNull(input.testingDay2 ?? null),
      testingDay3: dateOrNull(input.testingDay3 ?? null),
      goal: input.goal || null,
      state: input.state,
    },
  });

  revalidatePath("/sprints");
  revalidatePath(`/sprints/${sprint.slug}`);
  revalidatePath("/tasks");
}

export async function setSprintState(id: string, state: "PLANNED" | "ACTIVE" | "CLOSED") {
  await requireSession();
  const data: { state: "PLANNED" | "ACTIVE" | "CLOSED"; closedAt?: Date | null } = { state };
  if (state === "CLOSED") data.closedAt = new Date();
  else data.closedAt = null;
  await db.sprint.update({ where: { id }, data });
  revalidatePath("/sprints");
  revalidatePath("/tasks");
}

export async function closeSprint(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const retroNotes = String(formData.get("retroNotes") ?? "").trim() || null;
  if (!id) throw new Error("id required");
  await db.sprint.update({
    where: { id },
    data: { state: "CLOSED", closedAt: new Date(), retroNotes },
  });
  revalidatePath("/sprints");
  revalidatePath("/tasks");
}

export async function deleteSprint(id: string) {
  await requireSession();
  if (!id) throw new Error("id required");
  await db.$transaction([
    db.task.updateMany({ where: { sprintId: id }, data: { sprintId: null } }),
    db.sprint.delete({ where: { id } }),
  ]);
  revalidatePath("/sprints");
  revalidatePath("/tasks");
  redirect("/sprints");
}

export async function reviewSprintPlan(sprintId: string): Promise<{ sessionId: string }> {
  const session = await requireSession();
  const { sessionId } = await runReviewSprintPlan(sprintId, session.user.id);
  revalidatePath("/chat");
  return { sessionId };
}
