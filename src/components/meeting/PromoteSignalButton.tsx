"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { promoteSignalToFeature } from "@/app/features/actions";
import { Button } from "@/components/ui/button";

export function PromoteSignalButton({
  signalId,
  featureSlug,
}: {
  signalId: string;
  featureSlug: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (featureSlug) {
    return (
      <Link
        href={`/features/${featureSlug}`}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        In library →
      </Link>
    );
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        await promoteSignalToFeature({ signalId });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <Button variant="outline" size="sm" onClick={run} disabled={isPending} className="h-7 text-xs">
        {isPending ? "Promoting…" : "Promote to feature"}
      </Button>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
