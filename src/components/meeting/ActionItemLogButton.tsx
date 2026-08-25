"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendActionItemToLog } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";

/**
 * Pushes a meeting action item into the work log. There is no task board any
 * more — what came out of a conversation lands in the log like everything else,
 * and gets filed onto a thread from there.
 */
export function ActionItemLogButton({
  actionItemId,
  inLog,
}: {
  actionItemId: string;
  inLog: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pushed, setPushed] = useState(inLog);

  if (pushed) {
    return (
      <Link href="/log" className="shrink-0 text-xs text-muted-foreground hover:underline">
        In the log →
      </Link>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="shrink-0 text-xs"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await sendActionItemToLog(actionItemId);
          setPushed(true);
          router.refresh();
        })
      }
    >
      {isPending ? "Logging…" : "→ Log it"}
    </Button>
  );
}
