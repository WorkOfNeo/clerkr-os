---
name: clerkr-ideas
description: Add, find, edit, and delete entries on the shared Clerkr idea board via the clerkr-internal MCP. Use whenever the user shares a URL, attaches an image / screenshot, or describes an inspiration they want saved; also when they want to find / edit / delete past posts on the board.
---

# Clerkr Ideas — capture & curate inspirations

The `clerkr-internal` MCP server is the canonical interface for the team's
shared idea board. The board's primary writer is **you, via this skill** —
the web UI is just a viewer plus a fallback editor.

## When to trigger

Invoke this skill when the user:

- Pastes a URL with intent to save ("save this", "add to the board", "this is
  cool", or just drops a link with no other context)
- Attaches a screenshot, image, or photo with intent to save
- Verbally describes an idea / inspiration they want filed
- Asks to find, edit, change priority, or delete posts on the board

Do NOT trigger for casual link-sharing without save intent. Ask once if
unclear.

## Add from a URL

1. Fetch the page (your web fetch tool / browser).
2. Extract these fields:
   - `url` — canonical (prefer `<meta property="og:url">`; else the user's URL)
   - `title` — prefer `<meta property="og:title">`
   - `description` — 1–3 sentence plain-English summary of the page
   - `imageUrl` — `<meta property="og:image">` or the most prominent hero
     image URL. If the page has no usable image, **leave unset** — the card
     will render text-only. (Optionally pick one from the **Abstract image
     pool** below if you want visual weight.)
   - `postedAt` — the article's publish date if visible (ISO 8601). Don't
     invent it; leave unset if not stated.
3. Reason about the post:
   - `category` — short label like "product idea", "design inspiration",
     "ai tool", "pain point", "marketing tactic", "competitor", "writing".
     Pick one.
   - `todo` — one sentence: what someone might BUILD or DO based on this
   - `painPoint` — one sentence: what user problem it addresses
   - `priority` — 1–5; default 3. Use 5 only when the user flags it
     explicitly ("important", "must check this", "blocker idea").
4. Call `clerkr-internal:create_post`.
5. Reply with one line confirming what landed: title + the resulting post id.

## Add from a pasted image (screenshot / photo)

You **cannot** upload image bytes through this MCP — there's no tool that
accepts raw bytes or base64. `imageUrl` is a URL string only. So:

1. **Describe** what's visible in the image. Cover:
   - product / brand if recognizable
   - the obvious pattern, idea, or layout being shown
   - any visible text (OCR button labels, headlines, captions)
   - if the image references a known site (Linear, Figma, Notion, Vercel
     dashboards, etc.), name it
2. **URL handling for the post's `url` field**:
   - If the user provided a source URL alongside the image → use it.
   - If no source URL → ask once: *"Do you have a source URL for this, or
     should I file it as a text-only entry?"*
   - If the user has no source URL or says image-only → set `url` to
     `https://unsplash.com/s/photos/abstract` (a stable referent for text-only
     entries).
3. **imageUrl**:
   - Leave **unset** for text-only cards (the UI handles this fine; the card
     just shows the title + description + meta).
   - **Optionally** pick a URL from the Abstract image pool below to give
     the card a visual hero. Match the mood to the post, or rotate.
   - Never paste base64 or inline bytes into `imageUrl` — it's a URL field
     and will be rejected or stored as a broken string.
4. Populate `title`, `description`, `category`, `todo`, `painPoint`,
   `priority` from what you described.
5. Call `create_post` and confirm in one line.

## Add from a verbal description only

If the user just says *"save this idea: X"*, treat it like the image case
without an image:

1. Ask once if there's a source URL or reference you should fetch.
2. If yes → run the URL flow.
3. If no → set `url` to `https://unsplash.com/s/photos/abstract`, leave
   `imageUrl` unset (or pick from the pool below for visual flavour), and
   populate the rest from what the user described.
4. Call `create_post` and confirm in one line.

## Abstract image pool (optional flourish)

When you want to give a card visual weight but there's no real source image,
you can use one of these. Purely cosmetic — leaving `imageUrl` unset is
also fine (text-only cards look clean).

- https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1664&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1669295384050-a1d4357bd1d7?q=80&w=1770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1620121692029-d088224ddc74?q=80&w=2232&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1604079628040-94301bb21b91?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?q=80&w=1674&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1604076913837-52ab5629fba9?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1668681919287-7367677cdc4c?q=80&w=1770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1637825891028-564f672aa42c?q=80&w=1770&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D
- https://images.unsplash.com/photo-1653299832314-5d3dc1e5a83c?q=80&w=927&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D

You can also browse `https://unsplash.com/s/photos/abstract` for a more
topic-relevant abstract — but use the resulting `images.unsplash.com/...`
URL, not the page URL.

## Find / edit / delete

- *"What was that thing about <topic>?"* → `search_posts` with the topic.
- *"Show me everything from <name>"* → `list_posts` with `authorEmail`.
- *"Show high-priority stuff"* → `list_posts` with `sortBy: "priority_desc"`.
- *"Bump the priority on <title>"* → `search_posts` for the id, then
  `update_post` with the new priority.
- *"Delete the HN one"* → `search_posts` + `delete_post`. Confirm with the
  user before deletion if there's any ambiguity about which post they mean.

## Rules

- **Fill every field you reasonably can.** A post with empty `todo` and
  `painPoint` is half-useless. If the source doesn't say it explicitly,
  infer honestly: "this is X; you might use it for Y".
- **`imageUrl` is a URL string only.** Never paste base64 / bytes / data
  URIs. If you don't have a hostable URL, leave the field unset or pick
  from the abstract pool above.
- **Never fabricate dates.** Leave `postedAt` unset if the source doesn't
  state one.
- **Prefer canonical URLs.** `og:url` beats the user-supplied URL when they
  disagree.
- **Don't invent author info.** The MCP server sets `authorId` automatically
  from your API token.
- **Confirm deletions.** Always show the title/url you're about to delete and
  ask if it's the right one when there's any ambiguity.
- **One-line confirmations after each write.** The user is in flow; don't
  monologue.

## Tools available on this server

| Tool | Use for |
|---|---|
| `create_post` | New entry (URL, image, or idea) |
| `list_posts` | Browse with filters (category, author, priority, sort) |
| `get_post` | One post by id |
| `search_posts` | Free-text across title/description/todo/painPoint/category |
| `update_post` | Change any field on an existing post |
| `delete_post` | Remove a post (intentional — this is the canonical editor) |
