"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toggleActionItem } from "@/app/meetings/actions";
import { Checkbox } from "@/components/ui/checkbox";

export function ActionItemToggle({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Checkbox
      checked={done}
      disabled={isPending}
      className="mt-0.5"
      onCheckedChange={(v) => {
        startTransition(async () => {
          await toggleActionItem({ id, done: Boolean(v) });
          router.refresh();
        });
      }}
    />
  );
}
