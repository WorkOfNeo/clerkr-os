"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  value: string;
  mono?: boolean;
  className?: string;
  maxHeight?: string;
}

export function CopyBlock({ label, value, mono, className, maxHeight }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copy}
            className="h-6 gap-1.5 px-2 text-xs"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <div className="relative">
        <pre
          className={cn(
            "overflow-auto rounded border border-border bg-background p-3 text-xs leading-relaxed",
            mono && "font-mono",
            !label && "pr-12",
          )}
          style={maxHeight ? { maxHeight } : undefined}
        >
          {value}
        </pre>
        {!label && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copy}
            className="absolute right-1.5 top-1.5 h-6 gap-1.5 px-2 text-xs"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}
