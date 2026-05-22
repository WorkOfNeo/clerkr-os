// Inlined SKILL.md content shown verbatim on /settings so users can copy-paste
// it into ~/.claude/skills/clerkr-ideas/SKILL.md. Kept in sync with the
// canonical file at /skills/clerkr-ideas/SKILL.md in the repo root.

export const CLAUDE_SKILL_MD = `---
name: clerkr-ideas
description: Add, find, edit, and delete entries on the shared Clerkr idea board via the clerkr-internal MCP. Use whenever the user shares a URL, attaches an image / screenshot, or describes an inspiration they want saved; also when they want to find / edit / delete past posts on the board.
---

# Clerkr Ideas — capture & curate inspirations

The \`clerkr-internal\` MCP server is the canonical interface for the team's
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
2. Extract these fields from the page metadata + content:
   - \`url\` — canonical (prefer \`<meta property="og:url">\`; else the user's URL)
   - \`title\` — prefer \`<meta property="og:title">\`
   - \`description\` — 1–3 sentence plain-English summary of the page
   - \`imageUrl\` — \`<meta property="og:image">\` or the most prominent hero image.
     If the page has no usable image, fall back to the **Abstract image fallback
     pool** below.
   - \`postedAt\` — the article's publish date if visible (ISO 8601). Don't
     invent it; leave unset if not stated.
3. Reason about the post:
   - \`category\` — short label like "product idea", "design inspiration",
     "ai tool", "pain point", "marketing tactic", "competitor", "writing".
     Pick one.
   - \`todo\` — one sentence: what someone might BUILD or DO based on this
   - \`painPoint\` — one sentence: what user problem it addresses
   - \`priority\` — 1–5; default 3. Use 5 only when the user flags it
     explicitly ("important", "must check this", "blocker idea").
4. Call \`clerkr-internal:create_post\` with all of the above.
5. Reply with one line confirming what landed: title + the resulting post id.

## Add from an image (screenshot / photo / pasted)

1. Describe what's visible in the image. Cover:
   - product name / brand if recognizable
   - the obvious pattern, idea, or layout being shown
   - any visible text (OCR button labels, headlines, captions)
   - if the image clearly references a known site (Linear, Figma, Notion,
     Vercel dashboards, etc.), name it
2. **Get a hostable image URL.** The image bytes Claude can see are not
   addressable from the web — you must upload them to the app first:
   - Call \`upload_image\` with \`base64\` (the pasted image bytes,
     base64-encoded) and \`mimeType\` (\`image/png\`, \`image/jpeg\`,
     \`image/webp\`, or \`image/gif\`). Strip any \`data:<mime>;base64,\`
     prefix before passing.
   - The tool returns \`{ url, id, size, mimeType }\`. Use that \`url\` for
     \`imageUrl\` on the post.
   - If \`upload_image\` fails (>8 MB, unsupported MIME), fall back to the
     **Abstract image fallback pool** below.
3. URL handling for the post's \`url\` field:
   - If the user provided a source URL alongside the image → use it for \`url\`.
   - If no source URL → ask once: "Do you have a source URL for this, or
     should I file it image-only?"
   - If the user has no source URL or says image-only → set \`url\` to
     \`https://unsplash.com/s/photos/abstract\` (a stable referent).
4. Populate:
   - \`title\` — your one-line summary of what's in the image
   - \`description\` — 1–3 sentences of detail
   - \`category\`, \`todo\`, \`painPoint\`, \`priority\` as in the URL flow
   - \`imageUrl\` — **always** the URL from \`upload_image\` if the user pasted
     an image; only fall back to the Abstract pool if upload was impossible
5. Call \`create_post\` and confirm in one line.

## Add from a verbal description only

If the user just says "save this idea: X", treat it like the image case
without an image:

1. Ask once if there's a source URL or reference you should fetch.
2. If yes → run the URL flow.
3. If no → set \`url\` to \`https://unsplash.com/s/photos/abstract\`, set
   \`imageUrl\` to one from the Abstract image fallback pool below (pick one
   that vibes with the idea, or rotate), and populate the rest from what
   the user described.
4. Call \`create_post\` and confirm what you stored in one line.

## Abstract image fallback pool

When there's no source-page hero image AND no user-provided image, pick one
of these abstract Unsplash images for \`imageUrl\`. Choose one whose mood
roughly fits the post (cool/calm, bold/red, organic, geometric, etc.) — or
just rotate. They're all safe to embed directly.

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

If you want a more topic-specific abstract, browse
\`https://unsplash.com/s/photos/abstract\` (or a more specific search term)
and use the resulting \`images.unsplash.com/...\` URL. Avoid linking to the
Unsplash page itself for \`imageUrl\` — it needs to resolve directly to an
image.

## Find / edit / delete

- *"What was that thing about <topic>?"* → \`search_posts\` with the topic.
- *"Show me everything from <name>"* → \`list_posts\` with \`authorEmail\`.
- *"Show high-priority stuff"* → \`list_posts\` with \`sortBy: "priority_desc"\`.
- *"Bump the priority on <title>"* → \`search_posts\` for the id, then
  \`update_post\` with the new priority.
- *"Delete the HN one"* → \`search_posts\` + \`delete_post\`. Confirm with the
  user before deletion if there's any ambiguity about which post they mean.

## Rules

- **Fill every field you reasonably can.** A post with empty \`todo\` and
  \`painPoint\` is half-useless. If the source doesn't say it explicitly,
  infer honestly: "this is X; you might use it for Y".
- **Never leave a card image-less.** If no hero image exists on the source
  and the user didn't provide one, fall back to the Abstract image pool
  above — never leave \`imageUrl\` empty.
- **Never fabricate dates.** Leave \`postedAt\` unset if the source doesn't
  state one.
- **Prefer canonical URLs.** \`og:url\` beats the user-supplied URL when they
  disagree.
- **Don't invent author info.** The MCP server sets \`authorId\` automatically
  from your API token.
- **Confirm deletions.** Always show the title/url you're about to delete and
  ask if it's the right one when there's any ambiguity.
- **One-line confirmations after each write.** The user is in flow; don't
  monologue.

## Tools available on this server

| Tool | Use for |
|---|---|
| \`create_post\` | New entry (URL, image, or idea) |
| \`list_posts\` | Browse with filters (category, author, priority, sort) |
| \`get_post\` | One post by id |
| \`search_posts\` | Free-text across title/description/todo/painPoint/category |
| \`update_post\` | Change any field on an existing post |
| \`delete_post\` | Remove a post (intentional — this is the canonical editor) |
| \`upload_image\` | Upload pasted/attached image bytes → returns a public URL to use as \`imageUrl\` |
`;
