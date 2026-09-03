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

const INSTRUCTIONS = `This is Clerkr OS — NEO Labs' internal Product OS for the Clerkr product.

## Tickets (the part you write to most)

Anything raised lives here as a TICKET: an idea, a bug, a feature request, an
open question. Neo files them, teammates file them, and so do you. The developer
then comments on them and marks them fixed or shipped.

- **Search before you file.** Run \`search_tickets\` first — it matches on meaning,
  not keywords. If something close already exists, \`comment_on_ticket\` on that
  instead. A duplicate ticket is worse than no ticket.
- **Categories are editable rows, not a fixed list.** Call
  \`list_ticket_categories\` and tag with one that actually exists rather than
  inventing a label. Don't create new categories unprompted — Neo maintains them
  at /settings/categories.
- **Title the symptom, not your guess at the cause.** "Search returns nothing
  when the matter name has an apostrophe", not "Fix SQL escaping".
- **For a bug, the body needs what happened, what was expected, and how to
  reproduce it.** Never invent reproduction steps or error text the user didn't
  give you — leave them out and say so.
- Use \`reportedBy\` when it came from someone other than the token owner: a
  teammate, or a lawyer at a customer firm.
- Statuses: OPEN, IN_PROGRESS, FIXED (done in code, not released), SHIPPED (out
  and live), WONT_FIX (deliberately closed). Prefer WONT_FIX over
  \`delete_ticket\` — it keeps the record of the decision.
- When you fix something, \`comment_on_ticket\` with what the fix was and set the
  status in the same call.

Ask before filing tickets in bulk. One well-written ticket beats five vague ones.

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

Meetings structure into briefs (\`create_meeting\` + \`structure_meeting\`), and a
meeting action item can be raised as a ticket with
\`send_action_item_to_ticket\`. The Feature Library, clusters and kanban board are the
product-planning side; the wiki holds longer-form knowledge. Authorship on
everything you create is set automatically from the owner of the API token you
are calling with.`;

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
