"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, getHTMLFromFragment, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

import { htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from "@/lib/markdown/convert";
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
  minHeightClass = "min-h-[180px]",
}: {
  /** Markdown in. */
  value: string;
  /** Markdown out — debounced by the caller if it writes to a server. */
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** The full-page card wants a taller writing surface than the side sheet. */
  minHeightClass?: string;
}) {
  // The last markdown WE emitted. Used to tell an external change (a different
  // card opened) from the echo of our own typing — resetting content on the
  // latter would move the caret to the start on every keystroke.
  const lastEmitted = useRef(value);
  // handlePaste runs inside ProseMirror, which only hands it the view.
  const editorRef = useRef<Editor | null>(null);
  // The markdown the editor produced for what it was last seeded with, and
  // whether anything has been emitted since. StarterKit's TrailingNode appends
  // an empty paragraph to a note ending in a list or quote, which fires an
  // update with no one typing — and with autosave on, merely OPENING a card
  // would rewrite its note. An update that still serialises to the seed, before
  // the user has changed anything, is not a change.
  const seedMarkdown = useRef<string | null>(null);
  const emittedSinceSeed = useRef(false);

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
      // Without this the editor has no node for <img>, so a screenshot in the
      // note vanished from view and was dropped from the markdown on the next
      // keystroke. Base64 stays allowed only so notes written before images
      // were uploaded as attachments keep theirs.
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(value),
    editable: true,
    // Required in Next: rendering the editor during SSR desynchronises it from
    // the client tree.
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor, transaction }) => {
      const markdown = htmlToMarkdown(editor.getHTML());
      if (!emittedSinceSeed.current) {
        // Taken from the transaction's own "before" doc, not onCreate: the
        // trailing-node update can fire before the create event does.
        seedMarkdown.current ??= htmlToMarkdown(
          getHTMLFromFragment(transaction.before.content, editor.schema),
        );
        if (markdown === seedMarkdown.current) return;
      }
      emittedSinceSeed.current = true;
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: cn("prose-tiptap focus:outline-none", minHeightClass),
      },
      // Markdown copied out of Claude, a README or a terminal arrives as plain
      // text and would otherwise land as literal "## " and "- [ ]". Rich
      // clipboard content (a web page, a doc) keeps its own formatting, and
      // images are left to the ImageDropzone around the editor.
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data || data.files.length > 0) return false;
        const html = data.getData("text/html");
        if (html && /<(h[1-6]|ul|ol|li|strong|b|em|a|blockquote|pre|table)\b/i.test(html)) {
          return false;
        }
        const text = data.getData("text/plain");
        if (!looksLikeMarkdown(text) || !editorRef.current) return false;
        editorRef.current.commands.insertContent(markdownToHtml(text));
        return true;
      },
    },
  });
  editorRef.current = editor;

  // Re-seed only when the value changed somewhere else.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
    seedMarkdown.current = htmlToMarkdown(editor.getHTML());
    emittedSinceSeed.current = false;
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
