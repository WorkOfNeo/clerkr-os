import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOLS, type ToolContext } from "./tools";

// Per wiki cmozdetqx000kqa159ou8f2do — use the low-level `Server` class with
// manual setRequestHandler + plain JSON Schema inputSchemas. McpServer's
// high-level .tool() API leaks `execution`, `_meta`, `additionalProperties`,
// `$schema` into the wire shape, and some clients silently drop tools with
// unknown fields.

const INSTRUCTIONS = `This is Clerkr OS — NEO Labs' internal Product OS. It is run by one person, so
it is built around a WORK LOG rather than a task board: nothing is planned up
front, everything is recorded as it happens.

## The work log (the part you write to most)

A THREAD is one call the user has made, plus everything that happened while
acting on it. A LOG ENTRY is one durable thing that happened.

Write an entry with \`log_entry\` the moment something durable happens — do not
wait to be asked, and do not batch it up at the end:

- \`DECISION\`  the user made a call, and why
- \`WORKED\`    the right path — what worked, so it isn't re-derived
- \`DEAD_END\`  a bad path — what was tried and why it failed
- \`BLOCKER\`   what is stopping progress
- \`IDEA\`      for later (these roll up into the Feature Library)
- \`QUESTION\`  open and unresolved
- \`SHIPPED\`   it landed
- \`NOTE\`      everything else worth remembering

Rules that matter:

- Each entry body must stand alone. Write "Postgres 42703 — raw SQL must quote
  camelCase pgvector columns like \"embeddedAt\"", not "fixed that SQL bug".
- DEAD_END entries must say what was tried AND why it failed. That is the single
  most valuable thing in here.
- Only log a DECISION the user actually made. Your own suggestion is not one.
- Call \`list_threads\` or \`search_threads\` first and file the entry onto the
  right thread; only \`open_thread\` when the user commits to something genuinely
  new.
- Before proposing an approach, run \`search_log\` — if it was already tried and
  failed, say so instead of suggesting it again.
- \`close_thread\` is the payoff: it writes what came of the work and carries the
  surviving ideas into the Feature Library. Suggest it when a thread is finished,
  and use finalState ABANDONED when the work was dropped on purpose.

## The idea board

There is also a Pinterest-style board of product/design/marketing inspiration
found around the web. When the user gives you a URL or asks you to add a page
they're viewing, fetch the page and call \`create_post\` with:

- url:         canonical URL (prefer og:url)
- title:       page title (prefer og:title)
- description: 1–3 sentence plain-English summary
- imageUrl:    og:image or the most prominent hero image URL
- category:    short label, e.g. "product idea", "design inspiration",
               "ai tool", "pain point", "marketing tactic"
- todo:        one sentence — what someone might BUILD or DO from this
- painPoint:   one sentence — what user problem it addresses
- priority:    1–5 (default 3); use 5 only if the user explicitly flags it
- postedAt:    the source article's publish date if visible

Use \`list_posts\`, \`search_posts\`, \`update_post\`, \`delete_post\` to find, edit
or delete posts. All edit actions are intentional — the user has full control of
the board through these tools.

\`imageUrl\` is just a public URL string. If the source page has an og:image, use
that. If the user pasted an image with no source URL, leave \`imageUrl\` unset —
the card renders text-only. Never inline image bytes or base64 into any field.

## Everything else

Meetings structure into briefs (\`create_meeting\` + \`structure_meeting\`); the
Feature Library, clusters and roadmap are the product side; the wiki holds
longer-form knowledge. Authorship on everything you create is set automatically
from the owner of the API token you are calling with.`;

export function buildServer({ userId }: ToolContext): Server {
  const server = new Server(
    { name: "clerkr-internal", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(
        (req.params.arguments ?? {}) as Record<string, unknown>,
        { userId },
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
