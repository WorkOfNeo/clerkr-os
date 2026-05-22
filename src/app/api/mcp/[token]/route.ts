import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authenticateMcp } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

// URL-token variant for Claude.ai web's custom-connector dialog, which can't
// send a custom Authorization header (wiki cmoz86mw70009qa15hz1iow3y).
// Same auth check, token is in the path instead of the header.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  const userId = await authenticateMcp(token);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildServer({ userId });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
