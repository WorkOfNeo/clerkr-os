# clerkr-internal

Internal NEO Labs tool. Two parts in one Next.js app:

1. **Idea board** (`/grid`) — Pinterest-style cards backed by `Post`, populated via MCP.
2. **Tickets + wiki + LLM** (`/tickets`, `/wiki`, `/chat`) — the ticket queue that replaced
   the sprint board and a Google Doc, embedded wiki, OpenAI-powered assistant.
3. **Product OS** (`/meetings`, `/features`, `/roadmap`, `/knowledge`) — meetings structure
   into briefs; ideas accumulate in the Feature Library.

## Tickets (read this before changing anything in `/tickets`)

The ticket queue replaced both the sprint/task board and a Google Doc. Anything
raised — an idea, a bug, a feature request, an open question — is a **Ticket**;
the developer comments on it and marks it fixed/shipped. There is no sprint, no
backlog and no planning horizon.

- **Category is an editable row** (`TicketCategory`), not an enum, so a new type
  can be added at `/settings/categories` without a deploy. Seeded with Idea /
  Bug / Feature request / Question. `Ticket.categoryId` is nullable with
  `onDelete: SetNull` — deleting a category must never delete its tickets.
- **Status IS an enum** (`OPEN`, `IN_PROGRESS`, `FIXED`, `SHIPPED`, `WONT_FIX`)
  on purpose: code branches on "is this resolved" via `TICKET_STATUSES[s].resolved`
  in [src/lib/ticket-meta.ts](src/lib/ticket-meta.ts). That must not be editable
  out from under the logic.
- `Ticket.number` is an autoincrement human handle (#14). `resolveTicket` accepts
  an id, a slug, `14` or `#14` — MCP callers pass whichever they have.
- `authorId` is who put it in the system; `reportedBy` is free text for who it
  actually came from (a teammate, or a lawyer at a customer firm). They are not
  the same thing, and the UI shows `reportedBy` in preference.

**Single write path:** server actions and MCP tools both go through
`createTicket` / `addComment` in [src/lib/tickets.ts](src/lib/tickets.ts).
Slugging, embedding, attachments and provenance live there.

## Screenshots on tickets

Images are **bytes in Postgres** (`TicketAttachment.data`), not S3 — same pattern
as prod-spec's rejection attachments (wiki `cmquudjcd001ypf159yd5frw8`).

- Downscaled **client-side** by [src/lib/images/downscale-image.ts](src/lib/images/downscale-image.ts)
  before upload (canvas; longest edge ≤2000px; PNG kept for crisp screenshots,
  JPEG fallback when too heavy). No `sharp`, no native dep. A 4000×3000 / 10MB
  screenshot lands at ~35KB.
- They ride inline as base64 in the normal server-action payload and are decoded
  by [src/lib/images/decode-data-url.ts](src/lib/images/decode-data-url.ts). No
  separate upload endpoint, so there are no orphan rows to garbage-collect.
- **Paste is the primary path** — ⌘V on macOS, Ctrl+V on Windows. Both surface a
  clipboard screenshot as a `kind: "file"` item on the paste event, so
  `imagesFromClipboard` needs no per-platform branch. It returns `[]` for a
  text-only paste, and `ImageDropzone` only calls `preventDefault()` when an
  image was actually found — otherwise pasting text into the textarea breaks.
- **Never select `data` in a list query.** `attachmentSelect` in `tickets.ts`
  deliberately omits it; pulling bytes into `/tickets` would be megabytes a page.
- Served from `/api/attachments/[id]` behind the session cookie — screenshots can
  contain client matter, so that route is deliberately NOT in the `src/proxy.ts`
  public allowlist.

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

- Routes: **kebab-case** (`/tickets`, `/tickets/[slug]`).
- Components: **PascalCase** under `src/components/<domain>/<Component>.tsx`.
- Functions / vars: **camelCase**.
- Path alias `@/*` → `src/*`.

## Mutations

Server actions only — never `/api/*` for app code. Exceptions: `/api/auth/[...all]`
(Better Auth) and `/api/mcp` (MCP server), both machine-to-machine with no session
cookie; plus `/api/attachments/[id]`, which serves binary rather than data for a
component — the rule is about mutations. That route stays session-gated.

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
- **Single-tenant** — any signed-in user can read/edit everything (tickets, wiki). Don't accidentally add per-user scopes without an explicit decision.
- MCP uses Bearer `ApiToken` (created in `/settings`).

## AI wiring

All under [src/lib/ai/](src/lib/ai/):

- `openai.ts` — singleton client, cached on `globalThis` for dev hot-reload.
- `embed.ts` / `embed-wiki.ts` — wiki notes embed inline on save via raw SQL (`db.$executeRaw` with the pgvector `::vector` cast — Prisma can't bind to `Unsupported` columns from the generated client).
- `wiki-search.ts` — semantic search via `embedding <=> ${vec}::vector` cosine distance, with `Prisma.sql` for optional tag-array filter.
- `chat.ts` — `runChatTurn`: persists user msg, runs semantic search for context, calls `gpt-4o-mini`, persists assistant msg.
- `embed-sweep.ts` — `sweepMissingEmbeddings`: embeds any wiki note / feature / meeting / ticket whose `embedding` is NULL. Runs every 10 min (+ ~30s after boot) via `src/instrumentation.ts`, and on demand via the `backfill_embeddings` MCP tool. Nothing stays unsearchable even when an inline embed fails.

**Raw-SQL column gotcha:** the pgvector tables use camelCase column names (`"embeddedAt"`) because the Prisma fields have no `@map`. Raw `$executeRaw`/`$queryRaw` must quote them — unquoted `embedded_at` fails with Postgres `42703`, and inside `tryEmbed`-style wrappers it fails *silently*. This once left every wiki note / feature / meeting in prod unembedded.

Chat is **synchronous** (no streaming yet) — fine for the team's volume. Streaming is a follow-up.

If `OPENAI_API_KEY` is missing, AI call sites must return a friendly "OpenAI not configured" error rather than crash — see e.g. the `if (!isOpenAIAvailable())` branch in `src/app/wiki/actions.ts` `searchWikiNotes`.

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
npm run probe          # MCP wire-shape probe
npm run db:studio      # Prisma Studio
npm run db:seed        # idempotent — seeds the default ticket categories + a wiki note
```

Schema changes go through `prisma db push` for now (no migration files yet); the `db:migrate` script is wired to `prisma migrate dev` for when we baseline.

**HNSW indexes are dropped by every `prisma db push`.** They aren't expressible
in the schema (Prisma can't model index opclasses on `Unsupported` columns), so
push reconciles them away as unknown objects — this is not just a
wipe-and-re-push hazard, it happens on *every* push. Re-run the block below
after each one and confirm with `pg_indexes`.

They were missing entirely in prod until 2026-08-22, which meant every semantic
search was a sequential scan.

```sql
CREATE INDEX IF NOT EXISTS wiki_note_embedding_idx ON wiki_note USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS feature_embedding_idx   ON feature   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS meeting_embedding_idx   ON meeting   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ticket_embedding_idx    ON ticket    USING hnsw (embedding vector_cosine_ops);
```

```bash
psql "$DIRECT_URL" -c "SELECT tablename, indexname FROM pg_indexes WHERE indexdef ILIKE '%hnsw%';"
```

## `npm run lint` is broken

`next lint` was removed in Next 16 and the script was never migrated. Pre-existing; the
real gates are `npm run typecheck` and `npm run build`.
