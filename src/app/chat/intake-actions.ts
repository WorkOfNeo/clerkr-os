"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { classifyIntake } from "@/lib/ai/intake";
import { isOpenAIAvailable } from "@/lib/ai/openai";
import { attachImages } from "@/lib/attachments";
import { db } from "@/lib/db";
import { acceptProposal, claimAttachments } from "@/lib/intake/accept";
import { toDTO, type ProposalDTO } from "@/lib/intake/dto";
import { requireSession } from "@/lib/session";

// Intake lives in its own action file rather than chat/actions.ts: the two do
// genuinely different jobs — one answers questions, this one files work — and
// keeping them apart stops the chat module growing a second personality.

export interface IntakeResponse {
  sessionId: string;
  messageId: string | null;
  reply: string;
  proposals: ProposalDTO[];
  error?: string;
}

const attachmentSchema = z.object({
  dataUrl: z.string().min(1),
  fileName: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const submitSchema = z.object({
  sessionId: z.string().nullable(),
  text: z.string().trim().min(1, "Write something first"),
  attachments: z.array(attachmentSchema).max(20).optional(),
});

/**
 * The front door. Raw text (and any pasted screenshots) in; proposal cards out.
 * Nothing is written to the product here — every proposal waits for a human.
 */
export async function submitIntake(
  input: z.infer<typeof submitSchema>,
): Promise<IntakeResponse> {
  const session = await requireSession();
  const parsed = submitSchema.parse(input);

  if (!isOpenAIAvailable()) {
    return {
      sessionId: parsed.sessionId ?? "",
      messageId: null,
      reply: "",
      proposals: [],
      error: "OPENAI_API_KEY is not set, so intake can't classify anything.",
    };
  }

  let sessionId = parsed.sessionId;
  if (!sessionId) {
    const title = parsed.text.length > 60 ? `${parsed.text.slice(0, 60)}…` : parsed.text;
    const created = await db.chatSession.create({
      data: { title, userId: session.user.id },
      select: { id: true },
    });
    sessionId = created.id;
  }

  // The user's message is persisted BEFORE the model runs, so screenshots have
  // something to hang off and a classifier failure never loses what was typed.
  const userMessage = await db.chatMessage.create({
    data: { sessionId, role: "USER", content: parsed.text },
    select: { id: true },
  });
  await attachImages(
    parsed.attachments,
    { kind: "chatMessage", id: userMessage.id },
    session.user.id,
  );

  try {
    const result = await classifyIntake({ sessionId, rawText: parsed.text });
    const rows = await db.intakeProposal.findMany({
      where: { messageId: result.messageId },
      orderBy: { order: "asc" },
    });
    revalidatePath("/chat");
    return {
      sessionId,
      messageId: result.messageId,
      reply: result.reply,
      proposals: rows.map(toDTO),
    };
  } catch (err) {
    return {
      sessionId,
      messageId: null,
      reply: "",
      proposals: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Confirm one card. This is the moment anything is actually written. */
export async function acceptProposalAction(
  id: string,
): Promise<{ label: string; href: string } | { error: string }> {
  const session = await requireSession();

  const proposal = await db.intakeProposal.findUnique({ where: { id } });
  if (!proposal) return { error: "That proposal is gone." };
  if (proposal.status === "ACCEPTED") return { error: "That one's already been created." };

  try {
    const result = await acceptProposal(proposal, session.user.id);
    await claimAttachments(proposal.messageId, result);
    await db.intakeProposal.update({
      where: { id },
      data: { status: "ACCEPTED", createdType: result.type, createdId: result.id },
    });

    revalidatePath("/chat");
    revalidatePath("/tickets");
    revalidatePath("/kanban");
    return { label: result.label, href: result.href };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create that." };
  }
}

export async function dismissProposalAction(id: string): Promise<void> {
  await requireSession();
  await db.intakeProposal.update({ where: { id }, data: { status: "DISMISSED" } });
  revalidatePath("/chat");
}

const editSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().nullable().optional(),
  kind: z.enum(["TICKET", "MEETING", "WIKI_NOTE", "KANBAN_CARD", "FEATURE", "COMMENT"]).optional(),
});

/** Edit before accepting — the classifier gets the gist right and the wording
 *  wrong often enough that fixing it in place beats redoing the paste. */
export async function updateProposalAction(
  input: z.infer<typeof editSchema>,
): Promise<ProposalDTO> {
  await requireSession();
  const { id, ...rest } = editSchema.parse(input);
  const updated = await db.intakeProposal.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.body !== undefined ? { body: rest.body } : {}),
      ...(rest.kind !== undefined ? { kind: rest.kind } : {}),
    },
  });
  revalidatePath("/chat");
  return toDTO(updated);
}

/** Accept everything still outstanding. Returns what happened per card rather
 *  than failing the batch on the first error. */
export async function acceptAllProposals(
  messageId: string,
): Promise<{ created: number; failed: number }> {
  await requireSession();
  const rows = await db.intakeProposal.findMany({
    where: { messageId, status: "PROPOSED" },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  let created = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await acceptProposalAction(row.id);
    if ("error" in result) failed++;
    else created++;
  }
  return { created, failed };
}

export async function getProposalsForSession(sessionId: string): Promise<Record<string, ProposalDTO[]>> {
  await requireSession();
  const rows = await db.intakeProposal.findMany({
    where: { message: { sessionId } },
    orderBy: { order: "asc" },
  });
  const byMessage: Record<string, ProposalDTO[]> = {};
  for (const row of rows) {
    (byMessage[row.messageId] ??= []).push(toDTO(row));
  }
  return byMessage;
}
