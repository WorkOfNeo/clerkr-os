"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

import { cn } from "@/lib/utils";

interface Props {
  initialContent?: string;
  onChange?: (jsonString: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

export function TipTapEditor({
  initialContent,
  onChange,
  editable = true,
  placeholder = "Type / to format. Use # for headings, - for lists, [ ] for checkboxes.",
  className,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialContent ? safeParse(initialContent) : "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose-tiptap focus:outline-none min-h-[160px]",
          !editable && "pointer-events-none opacity-90",
        ),
        "data-placeholder": placeholder,
      },
    },
  });

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background px-3 py-2 text-sm",
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function safeParse(s: string): object | string {
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object") return obj;
  } catch {
    /* fall through */
  }
  // Treat as plain text / markdown — TipTap can take it as text.
  return s;
}
