import { NUMBERS_BASE } from "@/components/numbers/tabs";
import { WebsiteView } from "@/components/numbers/views";

import { gate } from "../gate";

export const dynamic = "force-dynamic";

/** Website. What it shows lives in WebsiteView; this page only decides who gets in. */
export default async function NumbersWebsitePage() {
  const access = await gate("website");
  return <WebsiteView scopes={access.scopes} base={NUMBERS_BASE} />;
}
