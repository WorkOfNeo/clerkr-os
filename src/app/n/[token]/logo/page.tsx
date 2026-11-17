import { linkBase } from "@/components/numbers/tabs";
import { LinkUnavailable, LogoView } from "@/components/numbers/views";

import { linkGate } from "../gate";

export const dynamic = "force-dynamic";

/** The logo slide, opened by a share link. Any live link sees it — it shows no numbers (../gate.ts). */
export default async function LinkLogoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scopes = await linkGate(token, null);
  if (!scopes) return <LinkUnavailable />;
  return <LogoView scopes={scopes} base={linkBase(token)} />;
}
