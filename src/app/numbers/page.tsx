import { NUMBERS_BASE } from "@/components/numbers/tabs";
import { DriftView } from "@/components/numbers/views";

import { gate } from "./gate";

export const dynamic = "force-dynamic";

/** Drift. What it shows lives in DriftView; this page only decides who gets in. */
export default async function NumbersDriftPage() {
  const access = await gate(null);
  return <DriftView scopes={access.scopes} base={NUMBERS_BASE} />;
}
