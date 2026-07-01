import { marked } from "marked";

import { cn } from "@/lib/utils";

interface Props {
  body: string;
  className?: string;
}

export function MarkdownView({ body, className }: Props) {
  const html = marked.parse(body, { async: false }) as string;
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
