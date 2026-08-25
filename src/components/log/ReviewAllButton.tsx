"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { reviewAllEntries } from "@/app/log/actions";

export function ReviewAllButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      className="text-muted-foreground hover:text-foreground"
      onClick={() =>
        startTransition(async () => {
          await reviewAllEntries();
          router.refresh();
        })
      }
    >
      {isPending ? "Keeping…" : "Keep all"}
    </button>
  );
}
