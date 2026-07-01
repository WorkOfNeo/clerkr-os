"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { resetPrompt, savePrompt } from "./actions";

export function PromptEditor({
  settingKey,
  title,
  description,
  value,
  isCustom,
}: {
  settingKey: string;
  title: string;
  description: string;
  value: string;
  isCustom: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
      await savePrompt(formData);
      setSaved(true);
      router.refresh();
    });
  }

  function handleReset() {
    startTransition(async () => {
      await resetPrompt(settingKey);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {isCustom ? "Customised" : "Using default"}
        </span>
      </div>
      <form action={handleSave} className="space-y-2">
        <input type="hidden" name="key" value={settingKey} />
        <Textarea
          name="value"
          defaultValue={value}
          rows={14}
          className="font-mono text-xs leading-relaxed"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving…" : "Save prompt"}
          </Button>
          {isCustom && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={handleReset}
            >
              Reset to default
            </Button>
          )}
          {saved && <span className="text-xs text-muted-foreground">Saved ✓</span>}
        </div>
      </form>
    </section>
  );
}
