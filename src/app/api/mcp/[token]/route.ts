import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { ensureProtocol } from "@/lib/base-url";
import { authenticateMcp } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

// URL-token variant for Claude.ai web's custom-connector dialog, which can't
// send a custom Authorization header (wiki cmoz86mw70009qa15hz1iow3y).
// Same auth check, token is in the path instead of the header.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function deriveOrigin(req: Request): string {
  const fromEnv = ensureProtocol(process.env.BETTER_AUTH_URL);
  if (fromEnv) return fromEnv;
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

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
  const server = buildServer({ userId, origin: deriveOrigin(req) });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
