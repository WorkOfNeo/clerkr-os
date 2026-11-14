import { getNumbersAccess } from "@/lib/numbers/access";
import { latestOps } from "@/lib/numbers/snapshot";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/**
 * The Drift tab's poll: the latest ops snapshot the Clerkr worker pushed.
 * Same access rule as the page (a live link with the product scope, or a
 * superadmin). Always JSON, never a redirect — the board treats anything but a
 * 200 JSON as "can't reach".
 */
export async function GET() {
  const access = await getNumbersAccess();
  if (!access || !access.scopes.includes("product")) {
    return Response.json({ error: "Ingen adgang." }, { status: access ? 403 : 401, headers: NO_STORE });
  }
  const latest = await latestOps();
  if (!latest) return Response.json({ error: "Ingen tal endnu." }, { status: 503, headers: NO_STORE });
  return Response.json(latest.payload, { headers: NO_STORE });
}
