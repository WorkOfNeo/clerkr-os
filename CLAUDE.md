# clerkr-internal

Internal NEO Labs tool. Two parts in one Next.js app:

1. **Idea board** (`/grid`) — Pinterest-style cards backed by `Post`, populated via MCP.
2. **Sprint board + wiki + LLM** (`/tasks`, `/sprints`, `/wiki`, `/chat`) — kanban for two-week sprints, embedded wiki for living knowledge, OpenAI-powered side-panel assistant.

## Stack

- Next 15 App Router, **RSC-first**. Pages call `db.*` directly (no API layer).
- Prisma v6 — **pinned**; v7 removed `url`/`directUrl` from schema. See note at top of `prisma/schema.prisma`.
- Postgres + **pgvector** (extension declared in the datasource block).
- Better Auth (email/password + bcrypt, allowlist via `ALLOWED_EMAILS`).
- MCP TS SDK ≥ 1.29, low-level `Server` class with plain JSON Schema in `inputSchema` (never zod).
- OpenAI for chat (`gpt-4o-mini`) and embeddings (`text-embedding-3-small`).
- shadcn/ui (Radix + Tailwind 3 + class-variance-authority).
- @dnd-kit for kanban drag-drop.
- @tiptap for the task description editor (markdown shortcuts, task lists).

## Conventions

- Routes: **kebab-case** (`/tasks`, `/sprints/[slug]`).
- Components: **PascalCase** under `src/components/<domain>/<Component>.tsx`.
- Functions / vars: **camelCase**.
- Path alias `@/*` → `src/*`.

## Mutations

Server actions only — never `/api/*` for app code. The two exceptions are `/api/auth/[...all]` (Better Auth) and `/api/mcp` (MCP server).

Pattern (see [src/app/grid/actions.ts](src/app/grid/actions.ts)):

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function doThing(formData: FormData) {
  await requireSession();
  const input = schema.parse(Object.fromEntries(formData));
  await db.thing.update({ ... });
  revalidatePath("/path");
}
```

## MCP tools

Single `TOOLS` array in [src/lib/mcp/tools.ts](src/lib/mcp/tools.ts), with per-domain arrays under [src/lib/mcp/tools/](src/lib/mcp/tools/). Every tool:

- `inputSchema` is **plain JSON Schema** — *never* a zod schema. The low-level Server registers it as-is; some clients drop tools with `$schema` / `additionalProperties` set.
- Args are parsed with zod **inside the handler**.
- Handlers receive `{ userId }` from `ToolContext` (Bearer ApiToken auth in `src/lib/mcp/auth.ts`).

Add new tools by appending to a domain file's exported array (or the inline post tools in `tools.ts`). After changes run:

```bash
npm run probe       # confirms wire shape
npm run typecheck
```

## Auth & access

- Better Auth + bcrypt password; `ALLOWED_EMAILS` env var gates signups (`src/lib/auth.ts` `databaseHooks.user.create.before`).
- **Single-tenant** — any signed-in user can read/edit everything (tasks, sprints, wiki). Don't accidentally add per-user scopes without an explicit decision.
- MCP uses Bearer `ApiToken` (created in `/settings`).

## AI wiring

All under [src/lib/ai/](src/lib/ai/):

- `openai.ts` — singleton client, cached on `globalThis` for dev hot-reload.
- `embed.ts` / `embed-wiki.ts` — wiki notes embed inline on save via raw SQL (`db.$executeRaw` with the pgvector `::vector` cast — Prisma can't bind to `Unsupported` columns from the generated client).
- `wiki-search.ts` — semantic search via `embedding <=> ${vec}::vector` cosine distance, with `Prisma.sql` for optional tag-array filter.
- `chat.ts` — `runChatTurn`: persists user msg, runs semantic search for context, calls `gpt-4o-mini`, persists assistant msg.
- `review-plan.ts` — `reviewSprintPlan`: builds a critique prompt with task list + wiki context, creates a `ChatSession` titled "Plan review: <name>".

Chat is **synchronous** (no streaming yet) — fine for the team's volume. Streaming is a follow-up.

If `OPENAI_API_KEY` is missing, AI call sites must return a friendly "OpenAI not configured" error rather than crash — see e.g. the `if (!isOpenAIAvailable())` branch in `src/app/wiki/actions.ts` `searchWikiNotes`.

## Sprint convention

Two-week sprints (14 days). Testing days computed by `src/lib/sprint-dates.ts`:

1. First Thursday on/after `startDate`.
2. Next Wednesday (week 2).
3. Next Friday (week 2).

These are defaults — every sprint row has its own editable `testingDay1..3`.

## Don't touch

- The `Post` model and the `/grid` page — the idea board is shipping; leave it alone.
- The flip-card CSS in `globals.css` — preserve-3d + overflow-hidden interaction is load-bearing.

## Hydration gotcha

Dates rendered on cards must use a **fixed locale** to avoid React error #418 (SSR/CSR mismatch):

```ts
new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
```

See `src/lib/format.ts` for the shared helpers; mirror that pattern in any new card-like component.

## Webhooks

**Hard rule (applies project-wide):** never write code that deletes webhooks. Idempotent setup must be register-only, never delete-then-recreate. See `~/.claude/CLAUDE.md` for the full rule.

## Run

```bash
npm run dev            # Next dev
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm run probe          # MCP wire-shape probe
npm run db:studio      # Prisma Studio
npm run db:seed        # idempotent taxonomy / starter sprint
```

Schema changes go through `prisma db push` for now (no migration files yet); the `db:migrate` script is wired to `prisma migrate dev` for when we baseline.

The HNSW index on `wiki_note.embedding` is *not* generated by `db push` — recreate it manually if you wipe and re-push:

```sql
CREATE INDEX IF NOT EXISTS wiki_note_embedding_idx
  ON wiki_note USING hnsw (embedding vector_cosine_ops);
```
