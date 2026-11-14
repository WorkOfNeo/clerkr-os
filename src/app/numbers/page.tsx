import { redirect } from "next/navigation";

import { NumbersTabs, ObFrame, scopeHref } from "@/components/numbers/ObFrame";
import { OpsBoard } from "@/components/numbers/ops/OpsBoard";
import { TV_H, TV_W, type OpsSnapshot } from "@/components/numbers/ops/snapshot";
import { latestOps } from "@/lib/numbers/snapshot";

import { gate } from "./gate";

export const dynamic = "force-dynamic";

/** Copied from Clerkr's ops-board page: scales the 1920×1080 canvas to the screen before first paint. */
const FIT_SCRIPT = `(function(){var s=document.createElement('style');s.id='ob-fit';document.head.appendChild(s);function fit(){s.textContent=':root{--ob-fit:'+Math.min(innerWidth/${TV_W},innerHeight/${TV_H})+'}'}fit();addEventListener('resize',fit)})()`;

/**
 * Drift — Clerkr's /ops-board, fed by the Clerkr prod worker's push instead of
 * a database connection. First paint is the latest stored snapshot; the board
 * then polls /numbers/live.
 */
export default async function NumbersDriftPage() {
  const access = await gate(null);
  if (!access.scopes.includes("product")) redirect(scopeHref(access.scopes[0]));

  const latest = await latestOps();
  if (!latest) {
    return (
      <ObFrame scopes={access.scopes} active="product" status={<span>Venter på prod</span>}>
        <p className="ob-empty" style={{ fontSize: 15 }}>
          Der er ikke kommet tal fra Clerkr endnu. Clerkr-workeren sender dem, når STATS_PUSH_URL og
          STATS_PUSH_SECRET er sat på dens production-service.
        </p>
      </ObFrame>
    );
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FIT_SCRIPT }} />
      <OpsBoard
        initial={latest.payload as unknown as OpsSnapshot}
        pollUrl="/numbers/live"
        nav={<NumbersTabs scopes={access.scopes} active="product" />}
      />
    </>
  );
}
