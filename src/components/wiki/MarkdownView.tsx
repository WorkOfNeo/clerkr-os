import { marked } from "marked";

import { cn } from "@/lib/utils";

interface Props {
  body: string;
  className?: string;
}

/**
 * Shared markdown renderer. Uses the hand-rolled `.md` styles from globals.css —
 * the `prose-*` classes this used to carry did nothing, because
 * @tailwindcss/typography was deliberately never installed.
 */
export function MarkdownView({ body, className }: Props) {
  const html = marked.parse(body, { async: false }) as string;
  return <div className={cn("md", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
