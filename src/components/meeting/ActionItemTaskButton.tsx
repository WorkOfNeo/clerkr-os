"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendActionItemToTask } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";

export function ActionItemTaskButton({
  actionItemId,
  onBoard,
}: {
  actionItemId: string;
  onBoard: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (onBoard) {
    return (
      <Link
        href="/tasks"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        On board →
      </Link>
    );
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        await sendActionItemToTask(actionItemId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button variant="outline" size="sm" onClick={run} disabled={isPending} className="h-7 text-xs">
        {isPending ? "Sending…" : "Send to tasks"}
      </Button>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
