import { NUMBERS_BASE } from "@/components/numbers/tabs";
import { LogoView } from "@/components/numbers/views";

import { gate } from "../gate";

export const dynamic = "force-dynamic";

/** The logo slide. What it shows lives in LogoView; this page only decides who gets in. */
export default async function NumbersLogoPage() {
  const access = await gate(null);
  return <LogoView scopes={access.scopes} base={NUMBERS_BASE} />;
}
