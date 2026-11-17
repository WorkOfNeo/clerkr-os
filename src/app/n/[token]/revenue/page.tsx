import { linkBase } from "@/components/numbers/tabs";
import { LinkUnavailable, RevenueView } from "@/components/numbers/views";

import { linkGate } from "../gate";

export const dynamic = "force-dynamic";

/** Omsætning, opened by a share link. The token in the path is the credential (../gate.ts). */
export default async function LinkRevenuePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scopes = await linkGate(token, "revenue");
  if (!scopes) return <LinkUnavailable />;
  return <RevenueView scopes={scopes} base={linkBase(token)} />;
}
