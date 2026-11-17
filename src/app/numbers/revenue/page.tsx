import { NUMBERS_BASE } from "@/components/numbers/tabs";
import { RevenueView } from "@/components/numbers/views";

import { gate } from "../gate";

export const dynamic = "force-dynamic";

/** Omsætning. What it shows lives in RevenueView; this page only decides who gets in. */
export default async function NumbersRevenuePage() {
  const access = await gate("revenue");
  return <RevenueView scopes={access.scopes} base={NUMBERS_BASE} />;
}
