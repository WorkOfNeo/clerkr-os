import type { NumbersAccess } from "./access";
import { latestOps } from "./snapshot";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/**
 * The Drift tab's poll: the latest ops snapshot the Clerkr worker pushed, for
 * a viewer with the product scope. Shared by /numbers/live (a signed-in
 * superadmin) and /n/<token>/live (the token in the path) — the routes
 * only decide who is asking. Always JSON, never a redirect: the board treats
 * anything but a 200 JSON as "can't reach".
 */
export async function liveOpsResponse(access: NumbersAccess | null): Promise<Response> {
  if (!access || !access.scopes.includes("product")) {
    return Response.json({ error: "Ingen adgang." }, { status: access ? 403 : 401, headers: NO_STORE });
  }
  const latest = await latestOps();
  if (!latest) return Response.json({ error: "Ingen tal endnu." }, { status: 503, headers: NO_STORE });
  return Response.json(latest.payload, { headers: NO_STORE });
}
