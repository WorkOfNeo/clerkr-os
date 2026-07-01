"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { structureMeeting } from "@/app/meetings/actions";
import { Button } from "@/components/ui/button";

export function StructureButton({
  meetingId,
  hasBrief,
  disabled,
}: {
  meetingId: string;
  hasBrief: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await structureMeeting(meetingId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={run}
        disabled={disabled || isPending}
        variant={hasBrief ? "outline" : "default"}
        size="sm"
      >
        {isPending ? "Structuring…" : hasBrief ? "Re-run AI" : "✦ Structure with AI"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
