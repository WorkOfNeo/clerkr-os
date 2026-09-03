"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown/convert";
import { cn } from "@/lib/utils";

/**
 * A live markdown editor — what you type formats itself as you type, the way
 * Notion does. No edit/preview toggle: typing "## " makes a heading, "- " a
 * bullet, "[ ] " a checkbox, and the result is what you are looking at.
 *
 * Markdown remains what is stored (see lib/markdown/convert.ts) — the
 * conversion happens at the edges so the Copilot, MCP and the wiki renderer
 * all still understand the text.
 */
export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = "Write anything. # for a heading, - for a list, [ ] for a checkbox.",
  className,
  autoFocus,
}: {
  /** Markdown in. */
  value: string;
  /** Markdown out — debounced by the caller if it writes to a server. */
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  // The last markdown WE emitted. Used to tell an external change (a different
  // card opened) from the echo of our own typing — resetting content on the
  // latter would move the caret to the start on every keystroke.
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Supplied separately below so it can carry its own options.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Only http(s) — a pasted javascript: URL must never become a live
        // link in a document other people open.
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(value),
    editable: true,
    // Required in Next: rendering the editor during SSR desynchronises it from
    // the client tree.
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => {
      const markdown = htmlToMarkdown(editor.getHTML());
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: "prose-tiptap min-h-[180px] focus:outline-none",
      },
    },
  });

  // Re-seed only when the value changed somewhere else.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      className={cn(
        "rounded-md bg-card px-3.5 py-3 text-[14px] shadow-xs ring-1 ring-inset ring-input",
        "focus-within:ring-2 focus-within:ring-primary/60",
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
