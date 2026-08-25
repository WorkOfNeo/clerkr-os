# clerkr-internal

Internal NEO Labs tool. Two parts in one Next.js app:

1. **Idea board** (`/grid`) — Pinterest-style cards backed by `Post`, populated via MCP.
2. **Work log + wiki + LLM** (`/log`, `/threads`, `/wiki`, `/chat`) — the activity log that
   replaced the sprint board, embedded wiki for living knowledge, OpenAI-powered assistant.
3. **Product OS** (`/meetings`, `/features`, `/roadmap`, `/knowledge`) — meetings structure
   into briefs; ideas accumulate in the Feature Library.

## The work log (read this before changing anything in `/log` or `/threads`)

This is a **one-person tool**, and the model is built for that. There is no sprint, no
backlog and no task board — those were removed deliberately in favour of recording work
as it happens rather than planning it up front.

- A **Thread** is one call that's been made, plus everything that happened while acting
  on it. `title` / `decision` / `why` / `state` (OPEN, PARKED, DONE, ABANDONED).
- A **LogEntry** is one durable thing that happened, typed by `LogKind`: `DECISION`,
  `WORKED`, `DEAD_END`, `BLOCKER`, `IDEA`, `QUESTION`, `SHIPPED`, `NOTE`. Entries can
  live with no thread — a loose note is still worth having, and gets filed later.
- Closing a thread runs `src/lib/ai/roll-up-thread.ts`: the AI reads the whole stream,
  writes the `outcome`, and promotes the surviving `IDEA` entries into the Feature
  Library via `upsertFeatureFromIdea` (deduped by embedding, so the same idea from two
  threads lands on one feature row). **This is the payoff for logging as you go** — don't
  break it casually.
- `DEAD_END` is the most valuable kind in here. The Copilot searches it before suggesting
  an approach so a failed path isn't retried.

**Single write path:** everything — server actions, MCP tools, session ingest — goes
through `createThread` / `writeLogEntry` in [src/lib/log.ts](src/lib/log.ts). Slugging,
embedding and provenance live there. Don't write `db.logEntry.create` directly.

Kind/state labels, colours and prompt vocabulary all come from
[src/lib/log-kinds.ts](src/lib/log-kinds.ts) — the AI prompts inject `kindVocabulary()`
at read time, so the enum and the prompt can never drift.

## Session-end capture

`scripts/clerkr-session-hook.mjs` is a Claude Code **SessionEnd** hook. Install with
`npm run hook:install -- --url <origin> --token <api-token>`; it appends to
`~/.claude/settings.json` and leaves existing hooks (nah-hook, ledger) alone.

The hook is a **dumb pipe** on purpose: its only local decision is "does this session's
cwd look like Clerkr work?" (`CLERKR_REPOS`, default `clerkr`). It strips tool calls out
of the transcript, keeps the tail, and POSTs to `/api/ingest/session`. Judging relevance,
extracting entries, matching a thread and embedding all happen server-side in
[src/lib/ai/ingest-session.ts](src/lib/ai/ingest-session.ts), where the OpenAI key and the
editable prompt already live. No model call and no OpenAI key ever touches the hook.

Two invariants in the hook, both load-bearing: it **always exits 0**, and it **never
writes to stdout** (SessionEnd can't block, and stdout would be parsed as a decision).

Ingest is idempotent on the Claude session id + a content hash, so a re-fired hook can't
double-log. Every offered session gets a `SessionIngest` row — *including* the ones judged
irrelevant, with the reason. That's the answer to "why didn't my session show up?"
(`ingest_history` MCP tool).

Entries the hook creates land with `reviewed: false` and surface in the review tray at the
top of `/log`. AI guesses must never quietly become fact.

## Stack

- Next 15 App Router, **RSC-first**. Pages call `db.*` directly (no API layer).
- Prisma v6 — **pinned**; v7 removed `url`/`directUrl` from schema. See note at top of `prisma/schema.prisma`.
- Postgres + **pgvector** (extension declared in the datasource block).
- Better Auth (email/password + bcrypt, allowlist via `ALLOWED_EMAILS`).
- MCP TS SDK ≥ 1.29, low-level `Server` class with plain JSON Schema in `inputSchema` (never zod).
- OpenAI for chat (`gpt-4o-mini`) and embeddings (`text-embedding-3-small`).
- shadcn/ui (Radix + Tailwind 3 + class-variance-authority).
- @dnd-kit for roadmap drag-drop.
- @tiptap for rich-text editing (markdown shortcuts, task lists).

## Conventions

- Routes: **kebab-case** (`/log`, `/threads/[slug]`).
- Components: **PascalCase** under `src/components/<domain>/<Component>.tsx`.
- Functions / vars: **camelCase**.
- Path alias `@/*` → `src/*`.

## Mutations

Server actions only — never `/api/*` for app code. Three exceptions, all
machine-to-machine callers with no session cookie: `/api/auth/[...all]` (Better Auth),
`/api/mcp` (MCP server) and `/api/ingest/session` (the session-end hook, Bearer ApiToken).

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
- **Single-tenant** — any signed-in user can read/edit everything (log, threads, wiki). Don't accidentally add per-user scopes without an explicit decision.
- MCP uses Bearer `ApiToken` (created in `/settings`).

## AI wiring

All under [src/lib/ai/](src/lib/ai/):

- `openai.ts` — singleton client, cached on `globalThis` for dev hot-reload.
- `embed.ts` / `embed-wiki.ts` — wiki notes embed inline on save via raw SQL (`db.$executeRaw` with the pgvector `::vector` cast — Prisma can't bind to `Unsupported` columns from the generated client).
- `wiki-search.ts` — semantic search via `embedding <=> ${vec}::vector` cosine distance, with `Prisma.sql` for optional tag-array filter.
- `chat.ts` — `runChatTurn`: persists user msg, runs semantic search for context, calls `gpt-4o-mini`, persists assistant msg.
- `roll-up-thread.ts` — `rollUpThread`: closes a thread, writes its outcome, promotes ideas into the Feature Library.
- `ingest-session.ts` — `ingestSession`: the server side of the session-end hook (relevance gate → extraction → thread attach → entries).
- `embed-sweep.ts` — `sweepMissingEmbeddings`: embeds any wiki note / feature / meeting / thread / log entry whose `embedding` is NULL. Runs every 10 min (+ ~30s after boot) via `src/instrumentation.ts`, and on demand via the `backfill_embeddings` MCP tool. Nothing stays unsearchable even when an inline embed fails.

**Raw-SQL column gotcha:** the pgvector tables use camelCase column names (`"embeddedAt"`) because the Prisma fields have no `@map`. Raw `$executeRaw`/`$queryRaw` must quote them — unquoted `embedded_at` fails with Postgres `42703`, and inside `tryEmbed`-style wrappers it fails *silently*. This once left every wiki note / feature / meeting in prod unembedded.

Chat is **synchronous** (no streaming yet) — fine for the team's volume. Streaming is a follow-up.

If `OPENAI_API_KEY` is missing, AI call sites must return a friendly "OpenAI not configured" error rather than crash — see e.g. the `if (!isOpenAIAvailable())` branch in `src/app/wiki/actions.ts` `searchWikiNotes`.

## Don't touch

- The `Post` model and the `/grid` page — the idea board is shipping; leave it alone.
- The `exit 0` / empty-stdout contract in `scripts/clerkr-session-hook.mjs`. A hook that
  throws or prints breaks every Claude Code session on the machine.
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
npm run probe          # MCP wire-shape probe
npm run db:studio      # Prisma Studio
npm run db:seed        # idempotent — seeds the "how the work log works" wiki note
npm run hook:install   # register the SessionEnd hook in ~/.claude/settings.json
```

Schema changes go through `prisma db push` for now (no migration files yet); the `db:migrate` script is wired to `prisma migrate dev` for when we baseline.

HNSW indexes on the `embedding` columns are *not* generated by `db push` — recreate them
manually if you wipe and re-push. (They were missing entirely in prod until 2026-08-22, so
every semantic search was a sequential scan. Check `pg_indexes` after any re-push.)

```sql
CREATE INDEX IF NOT EXISTS wiki_note_embedding_idx ON wiki_note USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS feature_embedding_idx   ON feature   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS meeting_embedding_idx   ON meeting   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS thread_embedding_idx    ON thread    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS log_entry_embedding_idx ON log_entry USING hnsw (embedding vector_cosine_ops);
```

## `npm run lint` is broken

`next lint` was removed in Next 16 and the script was never migrated. Pre-existing; the
real gates are `npm run typecheck` and `npm run build`.
