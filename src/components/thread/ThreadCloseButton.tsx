"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { closeThread } from "@/app/threads/actions";
import { Button } from "@/components/ui/button";

/**
 * The payoff button. Reads the whole entry stream, writes the thread's outcome
 * and carries the ideas it threw off into the Feature Library.
 */
export function ThreadCloseButton({
  threadId,
  entryCount,
  disabled,
}: {
  threadId: string;
  entryCount: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function run(state: "DONE" | "ABANDONED") {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await closeThread(threadId, state);
      if (res.error) {
        setError(res.error);
        return;
      }
      const created = res.featuresCreated ?? 0;
      const linked = res.featuresLinked ?? 0;
      setDone(
        created || linked
          ? `Rolled up — ${created} new feature${created === 1 ? "" : "s"}, ${linked} linked to existing.`
          : "Rolled up.",
      );
      router.refresh();
    });
  }

  const blocked = disabled || entryCount === 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={blocked || isPending} onClick={() => run("DONE")}>
          {isPending ? "Rolling up…" : "✦ Close & roll up"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || isPending}
          onClick={() => run("ABANDONED")}
          title="Stop here — the dead end is the learning"
        >
          Abandon
        </Button>
      </div>
      {entryCount === 0 && (
        <p className="text-xs text-muted-foreground">Log something first.</p>
      )}
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
      {done && <p className="max-w-xs text-right text-xs text-emerald-400">{done}</p>}
    </div>
  );
}
