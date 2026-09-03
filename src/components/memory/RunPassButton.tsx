"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Sparkles } from "lucide-react";

import { runMemoryPassNow } from "@/app/memory/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Run the nightly pass on demand, so it can be seen working rather than
 *  taken on trust the first time. */
export function RunPassButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const { proposed, scanned, reason } = await runMemoryPassNow();
          if (reason === "no-openai") {
            toast("OPENAI_API_KEY isn't set, so there's nothing to read with.", { tone: "error" });
          } else if (reason === "no-conversation") {
            toast("No conversation in the last two weeks to learn from.");
          } else {
            toast(
              proposed > 0
                ? `${proposed} suggestion${proposed === 1 ? "" : "s"} from ${scanned} messages`
                : `Nothing new worth remembering in ${scanned} messages`,
              { tone: proposed > 0 ? "success" : "default" },
            );
          }
          router.refresh();
        })
      }
    >
      <Sparkles className="h-3.5 w-3.5" />
      {isPending ? "Reading…" : "Run the pass now"}
    </Button>
  );
}
