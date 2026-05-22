import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { ensureProtocol } from "@/lib/base-url";
import { authenticateMcp, extractBearerToken } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

// Wiki cmowr214b0001pr15y6zosdr9 — runtime must be nodejs (Edge can't load
// the SDK). New transport+server per request (cheap, stateless).
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

async function handle(req: Request): Promise<Response> {
  const raw = extractBearerToken(req);
  const userId = await authenticateMcp(raw);
  if (!userId) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="clerkr-internal"' },
    });
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
