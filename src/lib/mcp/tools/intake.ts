import { z } from "zod";

import { db } from "@/lib/db";
import { acceptProposal, claimAttachments, linkProposalToExisting } from "@/lib/intake/accept";

import type { ToolDef } from "./types";

// Proposals over MCP. A proposal is a card waiting for a person — from the
// /chat intake desk or from a structured meeting — and these tools let Claude
// list them and, when the user says so, confirm or dismiss them. They go
// through the same acceptProposal path as the web buttons, so nothing here
// can create a record the UI couldn't.

const PROPOSAL_STATUSES = ["PROPOSED", "ACCEPTED", "DISMISSED"] as const;

export const proposalSelect = {
  id: true,
  kind: true,
  status: true,
  order: true,
  title: true,
  body: true,
  payload: true,
  matchType: true,
  matchId: true,
  matchTitle: true,
  matchScore: true,
  createdType: true,
  createdId: true,
  meetingId: true,
  messageId: true,
  createdAt: true,
} as const;

const idSchema = z.object({ id: z.string().min(1) });

export const INTAKE_TOOLS: ToolDef[] = [
  {
    name: "list_proposals",
    description:
      "List intake proposals — cards the AI suggested that are waiting for a person to accept. " +
      "Comes from two places: pastes into /chat, and meetings that were structured (decisions, " +
      "feature ideas, action items, open questions). Filter by meetingId to see one meeting's " +
      "cards. Default status PROPOSED.",
    inputSchema: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "Only proposals from this meeting." },
        status: { type: "string", enum: ["PROPOSED", "ACCEPTED", "DISMISSED"] },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50" },
      },
    },
    handler: async (args) => {
      const input = z
        .object({
          meetingId: z.string().optional(),
          status: z.enum(PROPOSAL_STATUSES).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(args);
      const proposals = await db.intakeProposal.findMany({
        where: {
          status: input.status ?? "PROPOSED",
          ...(input.meetingId ? { meetingId: input.meetingId } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { order: "asc" }],
        take: input.limit ?? 50,
        select: proposalSelect,
      });
      return { proposals, count: proposals.length };
    },
  },

  {
    name: "accept_proposal",
    description:
      "Confirm one proposal — THIS is the moment the record is written (ticket, feature, card, " +
      "note, meeting, or a decision / action item / open question on a meeting). Only do this " +
      "when the user has said to accept it; the whole point of a proposal is that a person " +
      "confirms it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      const { id } = idSchema.parse(args);
      const proposal = await db.intakeProposal.findUnique({ where: { id } });
      if (!proposal) throw new Error(`Proposal not found: ${id}`);
      if (proposal.status === "ACCEPTED") {
        return { alreadyAccepted: true, createdType: proposal.createdType, createdId: proposal.createdId };
      }
      const result = await acceptProposal(proposal, ctx.userId);
      await claimAttachments(proposal.messageId, result);
      await db.intakeProposal.update({
        where: { id },
        data: { status: "ACCEPTED", createdType: result.type, createdId: result.id },
      });
      return { ok: true, ...result };
    },
  },

  {
    name: "link_proposal_to_existing",
    description:
      "For a FEATURE proposal that matched something already in the library: link the meeting " +
      "to that existing feature instead of creating a duplicate. Marks the proposal accepted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const proposal = await db.intakeProposal.findUnique({ where: { id } });
      if (!proposal) throw new Error(`Proposal not found: ${id}`);
      if (proposal.status === "ACCEPTED") throw new Error("Already handled.");
      const result = await linkProposalToExisting(proposal);
      await db.intakeProposal.update({
        where: { id },
        data: { status: "ACCEPTED", createdType: result.type, createdId: result.id },
      });
      return { ok: true, ...result };
    },
  },

  {
    name: "dismiss_proposal",
    description:
      "Dismiss a proposal without creating anything. Prefer this over deleting: a dismissed " +
      "card is not re-proposed when the meeting is structured again.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const row = await db.intakeProposal.update({
        where: { id },
        data: { status: "DISMISSED" },
        select: { id: true, status: true, title: true },
      });
      return row;
    },
  },
];
