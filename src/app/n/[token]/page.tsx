import { linkBase } from "@/components/numbers/tabs";
import { LinkUnavailable, DriftView } from "@/components/numbers/views";

import { linkGate } from "./gate";

export const dynamic = "force-dynamic";

/** Drift, opened by a share link. The token in the path is the credential (./gate.ts). */
export default async function LinkDriftPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scopes = await linkGate(token, null);
  if (!scopes) return <LinkUnavailable />;
  return <DriftView scopes={scopes} base={linkBase(token)} />;
}
