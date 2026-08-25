"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { updateThread } from "@/app/threads/actions";
import { THREAD_STATES, THREAD_STATE_ORDER } from "@/lib/log-kinds";
import { cn } from "@/lib/utils";

import type { ThreadState } from "@prisma/client";

export function ThreadStateSelect({
  threadId,
  state,
}: {
  threadId: string;
  state: ThreadState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={state}
      disabled={isPending}
      onChange={(e) =>
        startTransition(async () => {
          await updateThread({ id: threadId, state: e.target.value as ThreadState });
          router.refresh();
        })
      }
      className={cn(
        "h-7 rounded-full border px-2 text-[11px] font-medium",
        THREAD_STATES[state].className,
      )}
    >
      {THREAD_STATE_ORDER.map((s) => (
        <option key={s} value={s} className="bg-background text-foreground">
          {THREAD_STATES[s].label}
        </option>
      ))}
    </select>
  );
}
