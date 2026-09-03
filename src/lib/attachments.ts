import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { decodeImageAttachments, type ImageAttachmentInput } from "@/lib/images/decode-data-url";

/**
 * The one write path for screenshots, wherever they're pinned.
 *
 * A screenshot is a screenshot whether it hangs off a ticket, a kanban card, a
 * meeting, a wiki note, a feature or a chat message. Rather than a table per
 * host, `Attachment` carries a nullable FK per host and everything funnels
 * through `attachImages` here — which is what keeps the "exactly one parent"
 * invariant true, since nothing else ever builds those columns.
 */

/** Every surface a screenshot can be attached to. Adding one means adding a
 *  nullable FK on Attachment and a case here — the compiler finds the rest. */
export type AttachmentOwner =
  | { kind: "ticket"; id: string }
  | { kind: "comment"; id: string }
  | { kind: "kanbanCard"; id: string }
  | { kind: "meeting"; id: string }
  | { kind: "wikiNote"; id: string }
  | { kind: "feature"; id: string }
  | { kind: "chatMessage"; id: string };

const OWNER_COLUMN: Record<AttachmentOwner["kind"], keyof Prisma.AttachmentUncheckedCreateInput> = {
  ticket: "ticketId",
  comment: "commentId",
  kanbanCard: "kanbanCardId",
  meeting: "meetingId",
  wikiNote: "wikiNoteId",
  feature: "featureId",
  chatMessage: "chatMessageId",
};

/** Bytes are deliberately excluded — a list query must never pull megabytes of
 *  screenshots out of Postgres. The id is enough to build the URL. */
export const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  width: true,
  height: true,
} satisfies Prisma.AttachmentSelect;

export type AttachmentRow = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

/**
 * Persist decoded images against one owner.
 *
 * Best-effort by design, carried over from the ticket path: a screenshot that
 * fails to decode must not take the bug report down with it — the text is the
 * part you can't reconstruct. Returns how many actually landed.
 */
export async function attachImages(
  attachments: ImageAttachmentInput[] | undefined,
  owner: AttachmentOwner,
  uploadedById?: string | null,
): Promise<number> {
  if (!attachments?.length) return 0;
  try {
    const decoded = decodeImageAttachments(attachments);
    await db.attachment.createMany({
      data: decoded.map((d) => ({
        [OWNER_COLUMN[owner.kind]]: owner.id,
        data: d.data,
        mimeType: d.mimeType,
        fileName: d.fileName,
        byteSize: d.byteSize,
        width: d.width,
        height: d.height,
        uploadedById: uploadedById ?? null,
      })) as Prisma.AttachmentCreateManyInput[],
    });
    return decoded.length;
  } catch (err) {
    console.warn(`[attachments] save failed for ${owner.kind} ${owner.id}:`, err);
    return 0;
  }
}

/** Move loose attachments onto a real owner. The chat composer stages
 *  screenshots against the message, then an accepted proposal claims them for
 *  whatever it created. */
export async function reassignAttachments(
  ids: string[],
  owner: AttachmentOwner,
): Promise<number> {
  if (!ids.length) return 0;
  const cleared: Prisma.AttachmentUncheckedUpdateManyInput = {
    ticketId: null,
    commentId: null,
    kanbanCardId: null,
    meetingId: null,
    wikiNoteId: null,
    featureId: null,
    chatMessageId: null,
  };
  const { count } = await db.attachment.updateMany({
    where: { id: { in: ids } },
    data: { ...cleared, [OWNER_COLUMN[owner.kind]]: owner.id },
  });
  return count;
}
