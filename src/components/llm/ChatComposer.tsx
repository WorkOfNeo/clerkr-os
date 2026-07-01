"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSubmit, disabled, placeholder }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const value = text.trim();
    if (!value || disabled) return;
    onSubmit(value);
    setText("");
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t bg-card p-2">
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Ask the assistant… (⌘/Ctrl+Enter to send)"}
        rows={2}
        className="min-h-[44px] flex-1 resize-none text-sm"
        disabled={disabled}
      />
      <Button size="icon" onClick={send} disabled={disabled || !text.trim()} aria-label="Send">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
