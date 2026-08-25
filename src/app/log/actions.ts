"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { createThread, writeLogEntry } from "@/lib/log";
import { LOG_KIND_ORDER } from "@/lib/log-kinds";
import { requireSession } from "@/lib/session";

const kindEnum = z.enum(LOG_KIND_ORDER as [string, ...string[]]);

const captureInput = z.object({
  body: z.string().trim().min(1, "Say what happened"),
  kind: kindEnum.default("NOTE"),
  // "" = unfiled, "new:<title>" = start a thread, otherwise a thread id.
  thread: z.string().optional().default(""),
  newThreadTitle: z.string().optional().default(""),
});

/**
 * The one capture path from the UI. Deliberately forgiving: an entry with no
 * thread is still worth having, and can be filed later from the feed.
 */
export async function captureEntry(formData: FormData): Promise<void> {
  const session = await requireSession();
  const input = captureInput.parse(Object.fromEntries(formData.entries()));

  let threadId: string | null = null;
  if (input.thread === "new") {
    const title = input.newThreadTitle.trim() || input.body.trim().slice(0, 80);
    const thread = await createThread({
      title,
      // A DECISION entry opening a thread IS the decision — carry it across so
      // the thread page reads right without retyping it.
      decision: input.kind === "DECISION" ? input.body.trim() : null,
      authorId: session.user.id,
    });
    threadId = thread.id;
  } else if (input.thread) {
    threadId = input.thread;
  }

  await writeLogEntry({
    body: input.body,
    kind: input.kind as never,
    threadId,
    source: "MANUAL",
    authorId: session.user.id,
  });

  revalidatePath("/log");
  revalidatePath("/threads");
}

const updateInput = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).optional(),
  kind: kindEnum.optional(),
  threadId: z.string().nullable().optional(),
});

export async function updateEntry(input: z.infer<typeof updateInput>): Promise<void> {
  await requireSession();
  const parsed = updateInput.parse(input);
  const { id, ...rest } = parsed;

  await db.logEntry.update({
    where: { id },
    data: {
      ...(rest.body !== undefined ? { body: rest.body } : {}),
      ...(rest.kind !== undefined ? { kind: rest.kind as never } : {}),
      ...(rest.threadId !== undefined ? { threadId: rest.threadId } : {}),
      // Any hand edit counts as a review.
      reviewed: true,
    },
  });

  if (rest.body !== undefined && isOpenAIAvailable()) {
    // Re-embed so semantic recall reflects the edit; the sweep covers failures.
    try {
      const { embedLogEntry } = await import("@/lib/ai/embed-entities");
      await embedLogEntry(id, rest.body);
    } catch (err) {
      console.warn("[log] re-embed failed:", err);
    }
  }

  revalidatePath("/log");
  revalidatePath("/threads");
}

/** Accept an AI-written entry as-is — clears it out of the review tray. */
export async function reviewEntry(id: string): Promise<void> {
  await requireSession();
  await db.logEntry.update({ where: { id }, data: { reviewed: true } });
  revalidatePath("/log");
}

export async function reviewAllEntries(): Promise<void> {
  await requireSession();
  await db.logEntry.updateMany({ where: { reviewed: false }, data: { reviewed: true } });
  revalidatePath("/log");
}

export async function deleteEntry(id: string): Promise<void> {
  await requireSession();
  // Detach any meeting action item first — the 1:1 link would block the delete.
  await db.actionItem.updateMany({ where: { logEntryId: id }, data: { logEntryId: null } });
  await db.logEntry.delete({ where: { id } });
  revalidatePath("/log");
  revalidatePath("/threads");
}

/** File a loose entry onto a thread from the feed. */
export async function fileEntry(id: string, threadId: string | null): Promise<void> {
  await requireSession();
  await db.logEntry.update({ where: { id }, data: { threadId, reviewed: true } });
  revalidatePath("/log");
  revalidatePath("/threads");
}
