import { getNumbersAccess } from "@/lib/numbers/access";
import { liveOpsResponse } from "@/lib/numbers/live";

export const dynamic = "force-dynamic";

/** The Drift tab's poll at /numbers: a signed-in superadmin (src/lib/numbers/live.ts). */
export async function GET() {
  return liveOpsResponse(await getNumbersAccess());
}
