import { z } from "zod";

import { db } from "@/lib/db";
import { memorySelect } from "@/lib/memory/memory";
import { slugify, uniqueSlug } from "@/lib/slug";

import type { ToolDef } from "./types";

// Memory and playbooks over MCP, so Claude can read what the team has taught
// the app — and propose additions without being able to enact them.

const CATEGORIES = ["PREFERENCE", "CONVENTION", "FACT", "CORRECTION", "ROUTING"] as const;

export const MEMORY_TOOLS: ToolDef[] = [
  {
    name: "list_memories",
    description:
      "Read what the team has taught Clerkr OS about how they work — preferences, conventions, " +
      "facts, corrections and routing rules. Read this before proposing how something should be " +
      "done; it is the difference between guessing at house style and knowing it.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PROPOSED", "ACTIVE", "DISMISSED"], description: "Default ACTIVE." },
        category: { type: "string", enum: [...CATEGORIES] },
      },
    },
    handler: async (args) => {
      const input = z
        .object({
          status: z.enum(["PROPOSED", "ACTIVE", "DISMISSED"]).optional(),
          category: z.enum(CATEGORIES).optional(),
        })
        .parse(args);
      const memories = await db.memory.findMany({
        where: { status: input.status ?? "ACTIVE", ...(input.category ? { category: input.category } : {}) },
        orderBy: [{ category: "asc" }, { createdAt: "asc" }],
        select: memorySelect,
      });
      return { memories, count: memories.length };
    },
  },

  {
    name: "propose_memory",
    description:
      "Suggest something worth remembering. It lands as PROPOSED and does nothing until a person " +
      "confirms it at /memory — you cannot put a memory into force yourself, and shouldn't be " +
      "able to. Propose only durable things: a preference, a convention, a correction you were " +
      "given. Never propose task content.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...CATEGORIES] },
        title: { type: "string", description: "One line, as it appears in a list." },
        content: { type: "string", description: "The instruction, imperative, as it will be read next time." },
        sourceNote: { type: "string", description: "One sentence: what led you to suggest it." },
      },
      required: ["category", "title", "content"],
    },
    handler: async (args) => {
      const input = z
        .object({
          category: z.enum(CATEGORIES),
          title: z.string().trim().min(1).max(200),
          content: z.string().trim().min(1).max(2000),
          sourceNote: z.string().max(500).optional(),
        })
        .parse(args);

      const existing = await db.memory.findFirst({
        where: { title: { equals: input.title, mode: "insensitive" } },
        select: { id: true, status: true },
      });
      if (existing) {
        return {
          ok: false,
          reason: `Already considered (${existing.status}) — not proposing it again.`,
          id: existing.id,
        };
      }

      const memory = await db.memory.create({
        data: { ...input, status: "PROPOSED", sourceNote: input.sourceNote ?? null },
        select: memorySelect,
      });
      return { ok: true, memory, note: "PROPOSED — a person must confirm it at /memory." };
    },
  },

  {
    name: "list_playbooks",
    description:
      "Read the written procedures the team follows. If one matches the task at hand, FOLLOW IT " +
      "rather than working the task out again or asking questions it already answers.",
    inputSchema: {
      type: "object",
      properties: {
        includeDisabled: { type: "boolean", description: "Default false." },
      },
    },
    handler: async (args) => {
      const input = z.object({ includeDisabled: z.boolean().optional() }).parse(args);
      const playbooks = await db.playbook.findMany({
        where: input.includeDisabled ? undefined : { enabled: true },
        orderBy: { name: "asc" },
      });
      return { playbooks, count: playbooks.length };
    },
  },

  {
    name: "upsert_playbook",
    description:
      "Create or update a playbook. `trigger` should read like the SITUATION it applies to, not " +
      "like a title — it is matched against what the user actually typed. Ask before writing one " +
      "unprompted; a playbook changes how every future request of that kind is handled.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        trigger: { type: "string", description: "When this applies, in plain English." },
        body: { type: "string", description: "Markdown: the steps, the defaults, what not to ask." },
        enabled: { type: "boolean" },
      },
      required: ["name", "trigger", "body"],
    },
    handler: async (args) => {
      const input = z
        .object({
          name: z.string().trim().min(1).max(120),
          trigger: z.string().trim().min(1).max(500),
          body: z.string().trim().min(1).max(20000),
          enabled: z.boolean().optional(),
        })
        .parse(args);

      const existing = await db.playbook.findFirst({
        where: { name: { equals: input.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        return db.playbook.update({ where: { id: existing.id }, data: input });
      }
      const slug = await uniqueSlug(slugify(input.name), async (c) =>
        Boolean(await db.playbook.findUnique({ where: { slug: c }, select: { id: true } })),
      );
      return db.playbook.create({ data: { ...input, slug, enabled: input.enabled ?? true } });
    },
  },

  {
    name: "delete_playbook",
    description: "Delete a playbook by name or id. Confirm with the user first — it changes how future work is handled.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string" } },
      required: ["ref"],
    },
    handler: async (args) => {
      const { ref } = z.object({ ref: z.string().min(1) }).parse(args);
      const playbook = await db.playbook.findFirst({
        where: { OR: [{ id: ref }, { slug: slugify(ref) }, { name: { equals: ref, mode: "insensitive" } }] },
        select: { id: true, name: true },
      });
      if (!playbook) throw new Error(`Playbook not found: ${ref}`);
      await db.playbook.delete({ where: { id: playbook.id } });
      return { ok: true, name: playbook.name };
    },
  },
];
