"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { rollUpThread } from "@/lib/ai/roll-up-thread";
import { ensureCluster } from "@/lib/clusters";
import { db } from "@/lib/db";
import { createThread, tryEmbedThread } from "@/lib/log";
import { THREAD_STATE_ORDER } from "@/lib/log-kinds";
import { requireSession } from "@/lib/session";

const stateEnum = z.enum(THREAD_STATE_ORDER as [string, ...string[]]);

const createInput = z.object({
  title: z.string().trim().min(1, "Title is required"),
  decision: z.string().optional().default(""),
  why: z.string().optional().default(""),
  cluster: z.string().optional().default(""),
});

export async function createThreadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const input = createInput.parse(Object.fromEntries(formData.entries()));

  const thread = await createThread({
    title: input.title,
    decision: input.decision || null,
    why: input.why || null,
    cluster: input.cluster || null,
    authorId: session.user.id,
  });

  revalidatePath("/threads");
  revalidatePath("/log");
  redirect(`/threads/${thread.slug}`);
}

const updateInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  decision: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
  state: stateEnum.optional(),
  cluster: z.string().nullable().optional(),
});

export async function updateThread(input: z.infer<typeof updateInput>): Promise<void> {
  await requireSession();
  const { id, cluster, ...rest } = updateInput.parse(input);

  const clusterId = cluster ? await ensureCluster(cluster) : cluster === null ? null : undefined;

  const thread = await db.thread.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.decision !== undefined ? { decision: rest.decision } : {}),
      ...(rest.why !== undefined ? { why: rest.why } : {}),
      ...(rest.state !== undefined ? { state: rest.state as never } : {}),
      ...(clusterId !== undefined ? { clusterId } : {}),
      // Reopening clears the close stamp so "when did this finish?" stays true.
      ...(rest.state === "OPEN" ? { closedAt: null } : {}),
      ...(rest.state === "DONE" || rest.state === "ABANDONED"
        ? { closedAt: new Date() }
        : {}),
    },
    select: { id: true, slug: true, title: true, decision: true, why: true, outcome: true },
  });

  await tryEmbedThread(
    thread.id,
    thread.title,
    thread.decision,
    [thread.why, thread.outcome].filter(Boolean).join("\n\n") || null,
  );

  revalidatePath("/threads");
  revalidatePath(`/threads/${thread.slug}`);
}

/**
 * Close a thread and let the AI read the whole stream: writes the outcome and
 * carries the surviving ideas into the Feature Library. This is the payoff for
 * logging as you go, so it gets a real error back rather than failing silently.
 */
export async function closeThread(
  id: string,
  finalState: "DONE" | "ABANDONED" = "DONE",
): Promise<{ error?: string; featuresCreated?: number; featuresLinked?: number }> {
  await requireSession();

  if (!isOpenAIAvailable()) {
    return { error: "OPENAI_API_KEY is not set. Roll-up is disabled." };
  }

  try {
    const result = await rollUpThread(id, finalState);
    const thread = await db.thread.findUnique({ where: { id }, select: { slug: true } });
    revalidatePath("/threads");
    revalidatePath("/features");
    if (thread) revalidatePath(`/threads/${thread.slug}`);
    return { featuresCreated: result.featuresCreated, featuresLinked: result.featuresLinked };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteThread(id: string): Promise<void> {
  await requireSession();
  // Entries outlive their thread — unfile them rather than losing the record.
  await db.logEntry.updateMany({ where: { threadId: id }, data: { threadId: null } });
  await db.chatSession.updateMany({ where: { threadId: id }, data: { threadId: null } });
  await db.thread.delete({ where: { id } });
  revalidatePath("/threads");
  revalidatePath("/log");
  redirect("/threads");
}
