import { linkBase } from "@/components/numbers/tabs";
import { LinkUnavailable, WebsiteView } from "@/components/numbers/views";

import { linkGate } from "../gate";

export const dynamic = "force-dynamic";

/** Website, opened by a share link. The token in the path is the credential (../gate.ts). */
export default async function LinkWebsitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scopes = await linkGate(token, "website");
  if (!scopes) return <LinkUnavailable />;
  return <WebsiteView scopes={scopes} base={linkBase(token)} />;
}
