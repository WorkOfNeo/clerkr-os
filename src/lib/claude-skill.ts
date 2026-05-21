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
   - \`imageUrl\` — \`<meta property="og:image">\` or the most prominent hero image
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
2. URL handling:
   - If the user provided a URL alongside the image → use it as \`url\` +
     \`imageUrl\` from the screenshot if you have a hosted version
   - If no URL → ask once: "Do you want me to find/use a source URL, or save
     it as image-only?"
   - For image-only: use a placeholder \`url\` and store the publicly hosted
     image URL if the user provided one separately.
3. Populate:
   - \`title\` — your one-line summary of what's in the image
   - \`description\` — 1–3 sentences of detail
   - \`category\`, \`todo\`, \`painPoint\`, \`priority\` as in the URL flow
   - \`imageUrl\` — the publicly-accessible image URL if you have one
4. Call \`create_post\` and confirm.

## Add from a verbal description only

If the user just says "save this idea: X", treat it like the image case
without an image. Ask for a source URL if relevant; otherwise create a post
with a placeholder \`url\` and explain what you stored.

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
`;
