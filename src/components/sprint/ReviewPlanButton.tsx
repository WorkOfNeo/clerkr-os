"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { reviewSprintPlan } from "@/app/sprints/actions";
import { Button } from "@/components/ui/button";

interface Props {
  sprintId: string;
}

export function ReviewPlanButton({ sprintId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    start(async () => {
      try {
        const { sessionId } = await reviewSprintPlan(sprintId);
        router.push(`/chat/${sessionId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={go} disabled={pending}>
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Reviewing…" : "Review this plan"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
