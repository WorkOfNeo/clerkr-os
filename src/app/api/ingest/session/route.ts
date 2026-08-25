import { z } from "zod";

import { ingestSession } from "@/lib/ai/ingest-session";
import { authenticateMcp, extractBearerToken } from "@/lib/mcp/auth";

// Machine-to-machine ingest for the Claude Code session-end hook. This is the
// third and last exception to the "server actions only, never /api/*" rule
// (alongside /api/auth and /api/mcp) — the caller is a detached shell script
// with no session cookie, so it authenticates with the same Bearer ApiToken the
// MCP server uses.
//
// The hook is deliberately dumb: it decides only whether a session *might* be
// Clerkr work, and posts the condensed transcript. Judging relevance, extracting
// entries, attaching threads and embedding all happen server-side, where the
// OpenAI key and the editable prompt already live.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  sessionId: z.string().min(1),
  transcript: z.string().min(1).max(400_000),
  cwd: z.string().nullish(),
  repo: z.string().nullish(),
  branch: z.string().nullish(),
});

export async function POST(req: Request): Promise<Response> {
  const userId = await authenticateMcp(extractBearerToken(req));
  if (!userId) {
    return Response.json(
      { status: "error", reason: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="clerkr-internal"' } },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ status: "error", reason: message }, { status: 400 });
  }

  try {
    const result = await ingestSession({ ...parsed, userId });
    return Response.json(result);
  } catch (err) {
    // The hook can't do anything useful with a 500, but the body is what shows
    // up in its log file — make it say something.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] failed:", err);
    return Response.json({ status: "error", reason: message }, { status: 500 });
  }
}
