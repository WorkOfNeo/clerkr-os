import { linkAccess } from "@/lib/numbers/access";
import { liveOpsResponse } from "@/lib/numbers/live";

export const dynamic = "force-dynamic";

/** The Drift tab's poll for a share link: the token in the path (src/lib/numbers/live.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return liveOpsResponse(await linkAccess(token));
}
