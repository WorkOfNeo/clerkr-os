# clerkr-internal

Internal NEO Labs tool. Two parts in one Next.js app:

1. **Idea board** (`/grid`) — Pinterest-style cards backed by `Post`, populated via MCP.
2. **Tickets + wiki + LLM** (`/tickets`, `/wiki`, `/chat`) — the ticket queue that replaced
   the sprint board and a Google Doc, embedded wiki, OpenAI-powered assistant.
   `/documents` is the general file store that sits alongside them.
3. **Product OS** (`/meetings`, `/features`, `/kanban`, `/knowledge`) — meetings structure
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

## Intake (`/chat`) — the front door

`/` redirects here. You paste raw text — meeting notes, a list of bugs, a
half-formed idea — and the model works out **what it is**, then proposes the
records that should exist. Two modes on one surface: **File it** classifies,
**Ask** is the old Copilot Q&A.

- **Nothing is written until a human confirms a card.** The model produces
  `IntakeProposal` rows (PROPOSED → ACCEPTED / DISMISSED), rendered as cards you
  can edit in place before accepting. This is the whole safety model — don't add
  a path that creates records straight from a classification.
- **One paste splits into many proposals.** Five bugs in one message become five
  tickets, not one.
- **Every proposal is matched against what exists** — `findNearest` in
  [src/lib/ai/intake.ts](src/lib/ai/intake.ts) runs a pgvector nearest-neighbour
  lookup per kind. Above `DUPLICATE_THRESHOLD` (0.86) the card warns and offers
  commenting instead. The threshold is deliberately high: a false "duplicate"
  hides real work, which is worse than a duplicate.
- **Accepting reuses the normal write paths** (`createTicket`, `createCard`, the
  wiki action) via [src/lib/intake/accept.ts](src/lib/intake/accept.ts), so
  slugging, embedding and provenance are identical however something arrived.
- Screenshots pasted with the note are pinned to the chat message first, then
  **follow whatever the card became** (`claimAttachments`).
- `ProposalDTO` and `toDTO` live in [src/lib/intake/dto.ts](src/lib/intake/dto.ts),
  NOT in the actions file — a `"use server"` module may only export async
  functions, and even `export type { … }` there is emitted as a real binding and
  fails the Turbopack build.

**The intake prompt is shared by everyone.** `AppSetting` is a global key/value
store, so tuning `intake.systemPrompt` at `/settings/prompts` tunes it for the
whole team. That is intended — it's an internal tool with one workflow.

## Kanban (`/kanban`)

Replaced the fixed Now/Next/Later roadmap. **Columns are editable rows**
(`KanbanColumn`), not an enum — the team invents whatever workflow it actually
runs, from the UI, with no deploy.

**Multiple boards.** A `KanbanBoard` is a whole workflow with its own columns;
`?board=<slug>` selects one and the pills under the page title switch between
them. Column `slug`/`name` are unique **per board**, so two boards can each
have a "Done". A new board is seeded with the starter columns (`seedColumns`)
because a board with no columns can't be used.

Deleting a board cascades to its columns, and the cards' `Restrict` FK then
blocks that cascade — so a board holding work can't be deleted. `deleteBoard`
checks first and returns a sentence rather than letting a foreign-key error
surface.

**A card is a document.** `CardPanel` opens it in a side sheet with a markdown
body rendered by the shared `MarkdownView` — same renderer as the wiki, so
links, headings, lists and images behave identically. Images pasted into the
panel become `Attachment` rows and are inserted into the body as markdown
pointing at `/api/attachments/[id]`.

- **`isDone` is the one piece of meaning the code needs.** Tick it on any column
  and cards landing there get `completedAt` stamped, cleared on the way out. Any
  number of columns can be terminal. Flipping the flag backfills the cards
  already in that column, so a column and its contents never disagree.
- Contrast `TicketStatus`, which stays an **enum on purpose** — ticket code
  branches on resolved-ness. Here the board *is* the workflow, so it must be data.
- **Deleting a column never deletes the work in it.** `KanbanCard.columnId` is
  required with `onDelete: Restrict`, so the DB refuses; the UI makes you pick
  where the cards go. A board can't drop below one column.
- Sparse ordering (gaps of 1000) — `orderForSlot` in
  [src/lib/kanban-order.ts](src/lib/kanban-order.ts), split out of `kanban.ts`
  so the client drag handler can use it without importing Prisma.
- The board **seeds its own columns on first visit** (`ensureColumns`), so there
  is no setup step on a fresh database.

## Attachments — one table, every surface

`TicketAttachment` became `Attachment`: one table hanging off tickets, ticket
comments, kanban cards, meetings, wiki notes, features and chat messages.

- Parents are **separate nullable FKs**, not an `(entityType, entityId)` pair —
  the database still enforces the parent exists and still cascades on delete.
- **`attachImages()` in [src/lib/attachments.ts](src/lib/attachments.ts) is the
  only thing that builds those columns**, which is what keeps "exactly one
  parent set" true.
- `ImageDropzone` moved to `src/components/attachments/` and takes a `max` —
  ⌘V / Ctrl+V, drag a batch, or the file picker. Still downscaled client-side.

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

## Documents (`/documents`)

The general file store — PDFs, images, spreadsheets, decks, anything. Kept
**whole and unmodified**, which is what separates it from `TicketAttachment`:
that one is a screenshot, downscaled on purpose, belonging to one ticket. A
`Document` is the original file because someone will need the original.

**Where the bytes live is a per-row fact, not a global one** (`Document.storage`),
so the backend can change without a migration and old rows keep resolving:

- `POSTGRES` (default) — bytes in `Document.data`. Nothing to provision, works
  on a fresh clone, and the files ride along in the normal database backup.
- `VOLUME` — bytes on disk under `DOCUMENTS_DIR`, a Railway volume. Uploads
  stream to disk and downloads stream back, so memory stays flat whatever the
  size.

Switching is one env var (`DOCUMENTS_DIR=/data/documents` after attaching a
volume in Railway); files already stored the other way keep serving. See
[src/lib/documents/storage.ts](src/lib/documents/storage.ts) and `.env.example`.

- **Upload is a route handler, not a server action** —
  `PUT /api/documents/upload` with the file as the raw request body. This is the
  documented exception, not a departure: a server action carries the file
  base64'd inside the RSC payload, a third bigger and buffered whole in memory,
  and capped by `serverActions.bodySizeLimit`. Metadata edits DO go through
  server actions ([src/app/documents/actions.ts](src/app/documents/actions.ts)).
- **Never select `data` in a list query.** `documentSelect` in
  [src/lib/documents/documents.ts](src/lib/documents/documents.ts) omits it. Same
  rule as `attachmentSelect`, and it bites harder here — these are originals, so
  a page of twenty would be hundreds of megabytes.
- **Only known-inert types are served `inline`.** `INLINE_SAFE` in
  [src/lib/documents/file-types.ts](src/lib/documents/file-types.ts) is an
  allowlist; everything else downloads. An uploaded `.html` — or an `.svg`,
  which can carry `<script>` — served inline would execute in OUR origin against
  the session cookie. SVG is absent from that list on purpose. The serve route
  also sets `nosniff` and a locked-down CSP.
- `/api/documents/*` is deliberately NOT in the `src/proxy.ts` public allowlist —
  documents can contain client matter, same reasoning as `/api/attachments/[id]`.
- A folder (`DocumentFolder`) is an editable row like `TicketCategory`, and
  `Document.folderId` is nullable with `onDelete: SetNull` — **deleting a folder
  must never delete the files in it.**
- The serve route honours `Range`, so a large PDF opens on page one rather than
  after the whole file lands.
- **If `DOCUMENTS_DIR` is set but the volume isn't attached, uploads are lost
  silently** — `mkdir -p` just creates the path on the container's ephemeral
  disk. `checkStorageReady()` runs at boot from `src/instrumentation.ts` and
  logs `[documents] STORAGE MISCONFIGURED` when the mount point is missing.
  Believe it.
- Documents are **not embedded**. Search is substring over name / description /
  tags — reading text out of a PDF or .docx needs a per-format extractor we
  haven't taken on. Worth doing later; it's why they're absent from
  `embed-sweep.ts`.

## PWA

Installable from Safari via Share → Add to Home Screen.
[src/app/manifest.ts](src/app/manifest.ts) provides the manifest
(`display: standalone` is what drops the address bar) and `layout.tsx` carries
the `appleWebApp` metadata and apple-touch-icon that iOS actually reads.

- **No service worker, deliberately.** iOS does not need one to install, and a
  badly-scoped SW caching RSC payloads breaks a Next app in ways that persist
  in the user's browser long after the fix. Offline support is a follow-up that
  needs real device testing, not a guess.
- `viewportFit: "cover"` exposes the safe-area insets; `.pb-safe` / `.pt-safe` /
  `.px-safe` in globals.css pad with them. Anything pinned to a screen edge
  needs one, or it sits under the notch or the home indicator.
- Icons are generated from `public/icons/icon.svg`. Regenerate the PNGs with
  `qlmanage -t -s 512` + `sips`, or any rasteriser — there is no build step.

## Layout & design system

Every page sits in [`AppShell`](src/components/AppShell.tsx) — a structural
sidebar on the left and a raised content surface beside it. The old top nav
(`AppNav`) is **gone**; a vertical rail scales to a dozen destinations where a
horizontal bar was already crowded at nine.

- **Add a nav destination in one place**: `NAV_SECTIONS` in
  [src/components/nav-items.ts](src/components/nav-items.ts). The desktop rail
  and the mobile drawer both read it, so they can't drift. Add it to
  `CommandPalette` too — that list is separate on purpose (it holds actions like
  "New ticket", not just pages).
- **Page headers go through [`PageHeader`](src/components/PageHeader.tsx)** —
  title, one line of orientation, actions. Don't hand-roll another `<h1>` block.
- **`AppShell` takes `flush`** for pages that own the whole viewport (intake,
  which has its own scroll regions and a pinned composer). Everything else gets
  the standard padded `<main className="mx-auto w-full max-w-* px-6 py-8">`.
  Don't use Tailwind's `container` inside the shell — it centres against the
  *viewport*, which fights the sidebar.
- **Sidebar collapse is CSS, not React state.** The width is `--sidebar-w`, and
  a blocking script in `layout.tsx` applies the saved preference before first
  paint. Reading `localStorage` during render would either mismatch on hydration
  or flash the wrong width for a frame. `SidebarNav` mirrors the state only for
  labels and aria.
- The active-item pill is a shared `layoutId`, so moving between destinations
  slides it rather than repainting.

Motion follows [the Apple design skill](~/.claude/skills/apple-design): springs
default to critically damped (`bounce: 0`), and bounce is reserved for
gesture-driven motion that carried momentum — the lifted kanban card, not a menu
that just appeared. `globals.css` honours `prefers-reduced-motion`,
`prefers-reduced-transparency` and `prefers-contrast`.

## Stack

- Next 15 App Router, **RSC-first**. Pages call `db.*` directly (no API layer).
- Prisma v6 — **pinned**; v7 removed `url`/`directUrl` from schema. See note at top of `prisma/schema.prisma`.
- Postgres + **pgvector** (extension declared in the datasource block).
- Better Auth (email/password + bcrypt, allowlist via `ALLOWED_EMAILS`).
- MCP TS SDK ≥ 1.29, low-level `Server` class with plain JSON Schema in `inputSchema` (never zod).
- OpenAI for chat (`gpt-4o-mini`) and embeddings (`text-embedding-3-small`).
- shadcn/ui (Radix + Tailwind 3 + class-variance-authority).
- @dnd-kit for kanban drag-drop.
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

**Prisma's CLI reads `.env`, not `.env.local`** — every `prisma`/`psql` command
needs the env sourced first, or it dies with
`Environment variable not found: DIRECT_URL`:

```bash
set -a && . ./.env.local && set +a && npx prisma db push
```

## Deploying the database

Railway's pre-deploy command is `npm run db:deploy`
([scripts/deploy-db.sh](scripts/deploy-db.sh)). Do NOT put a bare
`npx prisma db push` there again — that is what it replaced, and it was wrong
in three ways:

1. **It raced Postgres.** A deploy that started while the database was still
   booting died on `FATAL: the database system is starting up` and took the
   container with it. The script waits (`DB_WAIT_ATTEMPTS`, `DB_WAIT_SECONDS`).
2. **It dropped the HNSW indexes on every deploy** and never restored them —
   silently turning every semantic search into a sequential scan. The script
   re-applies [scripts/sql/hnsw-indexes.sql](scripts/sql/hnsw-indexes.sql)
   after each push.
3. **Nothing checked the result.** The script asserts four HNSW indexes exist
   and fails the deploy if not.

It deliberately does **not** pass `--accept-data-loss`: a deploy must never
silently drop a column. If the schema needs a destructive change, the deploy
fails and a human runs it by hand.

Note that Prisma counts **adding a unique constraint** as a possible data loss
("if there are existing duplicate values, this will fail"), so that will also
stop the deploy. Check for duplicates, then run the push by hand with the flag —
don't add the flag to the script.

Data migrations that push can't express (a backfill between ADD COLUMN and SET
NOT NULL, say) go in `scripts/sql/` and run first:
`npm run db:sql scripts/sql/002-multi-board.sql`.

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
