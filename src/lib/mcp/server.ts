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

const INSTRUCTIONS = `You are populating a shared Pinterest-style idea board for the Clerkr team
at https://clerkr-internal (the "board"). It collects product/design/marketing
inspiration the team finds around the web.

When the user gives you a URL or asks you to add a page they're viewing, fetch
the page and call \`create_post\` with these extracted fields:

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

When the user asks to find, edit, or delete posts, use \`list_posts\`,
\`search_posts\`, \`update_post\`, \`delete_post\`. All edit actions are
intentional — the user has full control over the board via these tools.
The author of each created post is automatically set to the owner of the
API token you're using to call this server.`;

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
