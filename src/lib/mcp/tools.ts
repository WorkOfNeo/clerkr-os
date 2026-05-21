import { z } from "zod";

import { db } from "@/lib/db";

export interface ToolContext {
  userId: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const priority = z.number().int().min(1).max(5);
const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(v)}`);
  }
  return d;
}

const createSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  todo: z.string().optional(),
  painPoint: z.string().optional(),
  priority: priority.optional(),
  postedAt: isoDate.optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  category: z.string().nullable().optional(),
  todo: z.string().nullable().optional(),
  painPoint: z.string().nullable().optional(),
  priority: priority.optional(),
  postedAt: isoDate.nullable().optional(),
});

const listSchema = z.object({
  category: z.string().optional(),
  authorEmail: z.string().email().optional(),
  minPriority: priority.optional(),
  sortBy: z.enum(["created_at_desc", "created_at_asc", "priority_desc", "priority_asc", "title_asc"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const idSchema = z.object({ id: z.string().min(1) });
const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

function orderBy(sortBy: z.infer<typeof listSchema>["sortBy"]) {
  switch (sortBy) {
    case "created_at_asc":
      return { createdAt: "asc" as const };
    case "priority_desc":
      return [{ priority: "desc" as const }, { createdAt: "desc" as const }];
    case "priority_asc":
      return [{ priority: "asc" as const }, { createdAt: "desc" as const }];
    case "title_asc":
      return { title: "asc" as const };
    case "created_at_desc":
    default:
      return { createdAt: "desc" as const };
  }
}

const postSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  imageUrl: true,
  category: true,
  todo: true,
  painPoint: true,
  priority: true,
  postedAt: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  author: { select: { id: true, email: true, name: true } },
} as const;

export const TOOLS: ToolDef[] = [
  {
    name: "create_post",
    description:
      "Add a new idea/inspiration post to the shared Clerkr idea board. " +
      "Use this after fetching a URL the user wants to capture. Always fill as " +
      "many fields as possible (title, description, imageUrl from og:image, " +
      "category, todo, painPoint, priority). The author is automatically set " +
      "to the owner of the API token making this call.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "Canonical source URL." },
        title: { type: "string", description: "Page or article title." },
        description: { type: "string", description: "1-3 sentence plain-English summary." },
        imageUrl: {
          type: "string",
          format: "uri",
          description: "Hero image (prefer og:image).",
        },
        category: {
          type: "string",
          description:
            "Short label, e.g. 'product idea', 'design inspiration', 'ai tool', 'pain point', 'marketing tactic'.",
        },
        todo: {
          type: "string",
          description: "One sentence — what someone might BUILD or DO from this.",
        },
        painPoint: {
          type: "string",
          description: "One sentence — what user problem it addresses.",
        },
        priority: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "1=low … 5=high. Defaults to 3.",
        },
        postedAt: {
          type: "string",
          description:
            "ISO 8601 datetime of the source article's publish date if visible.",
        },
      },
      required: ["url", "title"],
    },
    handler: async (args, ctx) => {
      const input = createSchema.parse(args);
      const post = await db.post.create({
        data: {
          url: input.url,
          title: input.title,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          category: input.category ?? null,
          todo: input.todo ?? null,
          painPoint: input.painPoint ?? null,
          priority: input.priority ?? 3,
          postedAt: input.postedAt ? new Date(input.postedAt) : null,
          authorId: ctx.userId,
        },
        select: postSelect,
      });
      return post;
    },
  },

  {
    name: "list_posts",
    description:
      "List posts on the board with optional filters. Default sort is newest first. " +
      "Use authorEmail to filter to a specific contributor; minPriority to focus on " +
      "what people flagged as important.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        authorEmail: { type: "string", format: "email" },
        minPriority: { type: "integer", minimum: 1, maximum: 5 },
        sortBy: {
          type: "string",
          enum: [
            "created_at_desc",
            "created_at_asc",
            "priority_desc",
            "priority_asc",
            "title_asc",
          ],
          description: "Default: created_at_desc",
        },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50" },
        offset: { type: "integer", minimum: 0 },
      },
    },
    handler: async (args) => {
      const input = listSchema.parse(args);
      const where: Record<string, unknown> = {};
      if (input.category) where.category = input.category;
      if (input.minPriority !== undefined) where.priority = { gte: input.minPriority };
      if (input.authorEmail) where.author = { email: input.authorEmail.toLowerCase() };

      const posts = await db.post.findMany({
        where,
        orderBy: orderBy(input.sortBy),
        take: input.limit ?? 50,
        skip: input.offset ?? 0,
        select: postSelect,
      });
      return { posts, count: posts.length };
    },
  },

  {
    name: "get_post",
    description: "Fetch one post by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      const post = await db.post.findUnique({ where: { id }, select: postSelect });
      if (!post) throw new Error(`Post not found: ${id}`);
      return post;
    },
  },

  {
    name: "update_post",
    description:
      "Update one or more fields on a post. Pass `null` for an optional field to clear it. " +
      "Any whitelisted user can edit any post (shared workspace).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string", format: "uri" },
        title: { type: "string" },
        description: { type: ["string", "null"] },
        imageUrl: { type: ["string", "null"], format: "uri" },
        category: { type: ["string", "null"] },
        todo: { type: ["string", "null"] },
        painPoint: { type: ["string", "null"] },
        priority: { type: "integer", minimum: 1, maximum: 5 },
        postedAt: { type: ["string", "null"] },
      },
      required: ["id"],
    },
    handler: async (args) => {
      const input = updateSchema.parse(args);
      const { id, postedAt, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (postedAt !== undefined) data.postedAt = parseDate(postedAt);
      const post = await db.post.update({ where: { id }, data, select: postSelect });
      return post;
    },
  },

  {
    name: "delete_post",
    description:
      "Delete a post from the board. This is intentional — the MCP is the primary " +
      "editor for the board.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args) => {
      const { id } = idSchema.parse(args);
      await db.post.delete({ where: { id } });
      return { ok: true, id };
    },
  },

  {
    name: "search_posts",
    description:
      "Free-text search across title, description, todo, and painPoint. Case-insensitive.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, limit } = searchSchema.parse(args);
      const q = { contains: query, mode: "insensitive" as const };
      const posts = await db.post.findMany({
        where: {
          OR: [
            { title: q },
            { description: q },
            { todo: q },
            { painPoint: q },
            { category: q },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit ?? 50,
        select: postSelect,
      });
      return { posts, count: posts.length };
    },
  },
];
