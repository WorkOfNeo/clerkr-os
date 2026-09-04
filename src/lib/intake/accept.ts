import type { IntakeProposal } from "@prisma/client";

import { embedFeature } from "@/lib/ai/embed-entities";
import { reassignAttachments } from "@/lib/attachments";
import { db } from "@/lib/db";
import { createCard, resolveColumnId } from "@/lib/kanban";
import { createTicket, resolveCategoryId } from "@/lib/tickets";
import { slugify, uniqueSlug } from "@/lib/slug";

/**
 * Turn a confirmed proposal into the real thing.
 *
 * This is the only place a proposal becomes a record, and it reuses the same
 * write paths the rest of the app uses (`createTicket`, `createCard`, the wiki
 * action) rather than talking to Prisma directly — so slugging, embedding and
 * provenance behave identically whether something arrived through intake or
 * was typed into its own form.
 */

export interface AcceptResult {
  type: string;
  id: string;
  label: string;
  href: string;
}

/** Narrow a JSON payload field without trusting the model's shape. */
function str(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function strArray(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== "object") return [];
  const v = (payload as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && Boolean(x.trim())) : [];
}

function date(payload: unknown, key: string): Date | null {
  const raw = str(payload, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function acceptProposal(
  proposal: IntakeProposal,
  userId: string,
): Promise<AcceptResult> {
  const { kind, title, body, payload, meetingId } = proposal;

  switch (kind) {
    case "TICKET": {
      const ticket = await createTicket({
        title,
        body,
        // A slug the model invented that no longer exists must not lose the
        // ticket — fall back to uncategorised.
        categoryId: await safeCategoryId(str(payload, "category")),
        priority: (str(payload, "priority") ?? "MEDIUM") as never,
        reportedBy: str(payload, "reportedBy"),
        source: "MCP",
        authorId: userId,
      });
      return {
        type: "ticket",
        id: ticket.id,
        label: `#${ticket.number} ${ticket.title}`,
        href: `/tickets/${ticket.slug}`,
      };
    }

    case "KANBAN_CARD": {
      const card = await createCard({
        title,
        description: body,
        columnId: await safeColumnId(str(payload, "column")),
        themeTag: str(payload, "themeTag"),
        dueDate: date(payload, "dueDate"),
      });
      return { type: "kanban_card", id: card.id, label: card.title, href: "/kanban" };
    }

    case "WIKI_NOTE": {
      const { createWikiNote } = await import("@/app/wiki/actions");
      const note = await createWikiNote({
        title,
        body: body ?? "",
        tags: strArray(payload, "tags"),
      });
      return { type: "wiki_note", id: note.slug, label: title, href: `/wiki/${note.slug}` };
    }

    case "MEETING": {
      // The raw text goes in whole; turning it into a brief is a separate,
      // explicit step the user triggers from the meeting page.
      const slug = await uniqueSlug(slugify(title), async (c) =>
        Boolean(await db.meeting.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const meeting = await db.meeting.create({
        data: {
          slug,
          title,
          transcript: body ?? title,
          meetingDate: date(payload, "meetingDate") ?? new Date(),
          attendees: strArray(payload, "attendees"),
          kind: (str(payload, "meetingKind") ?? "INTERNAL") as never,
          authorId: userId,
        },
        select: { id: true, slug: true, title: true },
      });
      return {
        type: "meeting",
        id: meeting.id,
        label: meeting.title,
        href: `/meetings/${meeting.id}`,
      };
    }

    case "FEATURE": {
      const slug = await uniqueSlug(slugify(title), async (c) =>
        Boolean(await db.feature.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      const feature = await db.feature.create({
        data: {
          slug,
          title,
          description: body,
          status: (str(payload, "status") ?? "IDEA") as never,
          tags: strArray(payload, "tags"),
          clusterId: await clusterIdFor(str(payload, "cluster")),
        },
        select: { id: true, slug: true, title: true },
      });
      try {
        await embedFeature(feature.id, title, body ?? "");
      } catch (err) {
        // The embed sweep picks it up within 10 minutes.
        console.warn("[accept] embedFeature failed:", err);
      }
      // A feature out of a meeting keeps its provenance: the signal row is what
      // the feature page lists under "Source signals" and what the meeting's
      // one-click delete follows back.
      if (meetingId) {
        await db.featureSignal.create({
          data: {
            meetingId,
            featureId: feature.id,
            title,
            detail: body,
            status: (str(payload, "signalStatus") ?? "NEW") as never,
            tags: strArray(payload, "tags"),
          },
        });
      }
      return {
        type: "feature",
        id: feature.id,
        label: feature.title,
        href: `/features/${feature.slug}`,
      };
    }

    // ── Meeting-brief kinds: rows on the meeting itself ─────────────────────
    // These only exist as a consequence of a meeting, so they refuse to be
    // accepted without one rather than inventing an orphan.

    case "DECISION": {
      const decision = await db.decision.create({
        data: { meetingId: requireMeeting(meetingId), content: title, owner: str(payload, "owner") },
        select: { id: true },
      });
      return { type: "decision", id: decision.id, label: title, href: `/meetings/${meetingId}` };
    }

    case "ACTION_ITEM": {
      const item = await db.actionItem.create({
        data: {
          meetingId: requireMeeting(meetingId),
          content: title,
          assignee: str(payload, "assignee"),
          dueDate: date(payload, "dueDate"),
        },
        select: { id: true },
      });
      return { type: "action_item", id: item.id, label: title, href: `/meetings/${meetingId}` };
    }

    case "OPEN_QUESTION": {
      const q = await db.openQuestion.create({
        data: { meetingId: requireMeeting(meetingId), content: title },
        select: { id: true },
      });
      return { type: "open_question", id: q.id, label: title, href: `/meetings/${meetingId}` };
    }

    case "COMMENT": {
      // The near-duplicate path: add to what exists instead of forking it.
      const targetId = proposal.matchId ?? str(payload, "targetRef");
      const targetType = proposal.matchType ?? str(payload, "targetType");
      if (!targetId || targetType !== "ticket") {
        throw new Error(
          "Comments can only be added to a ticket right now — accept this as a ticket instead.",
        );
      }
      const { addComment } = await import("@/lib/tickets");
      await addComment({
        ticketId: targetId,
        body: body ?? title,
        authorId: userId,
        source: "MCP",
      });
      const ticket = await db.ticket.findUnique({
        where: { id: targetId },
        select: { slug: true, number: true, title: true },
      });
      return {
        type: "ticket_comment",
        id: targetId,
        label: ticket ? `#${ticket.number} ${ticket.title}` : "Comment added",
        href: ticket ? `/tickets/${ticket.slug}` : "/tickets",
      };
    }

    default:
      throw new Error(`Don't know how to accept a ${kind} proposal.`);
  }
}

/**
 * The near-duplicate path for a feature: instead of a second row in the
 * library, point this meeting at the one that already exists. The proposal is
 * marked accepted with `createdType: "feature_link"`, which is how the
 * meeting's delete knows the feature is not its own to remove.
 */
export async function linkProposalToExisting(proposal: IntakeProposal): Promise<AcceptResult> {
  if (proposal.kind !== "FEATURE" || proposal.matchType !== "feature" || !proposal.matchId) {
    throw new Error("Only a feature with a library match can be linked.");
  }
  const feature = await db.feature.findUnique({
    where: { id: proposal.matchId },
    select: { id: true, slug: true, title: true },
  });
  if (!feature) throw new Error("That feature no longer exists — create it instead.");

  if (proposal.meetingId) {
    await db.featureSignal.create({
      data: {
        meetingId: proposal.meetingId,
        featureId: feature.id,
        title: proposal.title,
        detail: proposal.body,
        status: "ALREADY_TRACKED",
        tags: strArray(proposal.payload, "tags"),
      },
    });
  }
  return {
    type: "feature_link",
    id: feature.id,
    label: feature.title,
    href: `/features/${feature.slug}`,
  };
}

function requireMeeting(meetingId: string | null): string {
  if (!meetingId) throw new Error("This kind of proposal only makes sense on a meeting.");
  return meetingId;
}

/** Screenshots pasted with the note follow whatever the note became. */
export async function claimAttachments(
  messageId: string | null,
  result: AcceptResult,
): Promise<void> {
  if (!messageId) return;
  const owner = ATTACHABLE[result.type];
  if (!owner) return;
  const attachments = await db.attachment.findMany({
    where: { chatMessageId: messageId },
    select: { id: true },
  });
  if (!attachments.length) return;
  await reassignAttachments(
    attachments.map((a) => a.id),
    { kind: owner, id: result.id },
  );
}

// Only these can hold a screenshot today; a wiki note or feature keeps the
// image on the chat message rather than silently dropping it.
const ATTACHABLE: Record<string, "ticket" | "kanbanCard" | "meeting"> = {
  ticket: "ticket",
  kanban_card: "kanbanCard",
  meeting: "meeting",
};

async function safeCategoryId(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  try {
    return await resolveCategoryId(ref);
  } catch {
    return null;
  }
}

async function safeColumnId(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  try {
    return await resolveColumnId(ref);
  } catch {
    return null;
  }
}

async function clusterIdFor(name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await db.cluster.findFirst({
    where: { OR: [{ slug: slugify(name) }, { name: { equals: name, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  // A genuinely new product area is worth creating — that's how the library
  // grows — but it's flagged as auto-suggested so it can be reviewed.
  const created = await db.cluster.create({
    data: { slug: slugify(name), name, autoSuggested: true },
    select: { id: true },
  });
  return created.id;
}
