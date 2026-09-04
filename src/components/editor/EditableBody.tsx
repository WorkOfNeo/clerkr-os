"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/wiki/MarkdownView";
import { cn } from "@/lib/utils";

/**
 * The body of anything, made editable in place.
 *
 * Reads as the rendered document until you click it, then becomes the same
 * live markdown editor the kanban panel uses — headings, lists, links and
 * images formatting as you type rather than behind a preview toggle.
 *
 * Both callbacks are passed in rather than imported, so this works for a
 * ticket, a wiki note or anything else with a markdown body and somewhere to
 * put an image.
 */
export function EditableBody({
  value,
  onSave,
  onAttach,
  placeholder = "No detail given.",
  emptyPrompt = "Add detail — markdown, links, images",
  className,
}: {
  value: string | null;
  onSave: (markdown: string | null) => Promise<void>;
  /** Omit and the dropzone is hidden — not everything can hold an image. */
  onAttach?: (images: PendingImage[]) => Promise<void>;
  placeholder?: string;
  emptyPrompt?: string;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(value ?? "");
  const [images, setImages] = useState<PendingImage[]>([]);

  function save() {
    startTransition(async () => {
      await onSave(body.trim() || null);
      if (images.length && onAttach) {
        await onAttach(images);
        setImages([]);
      }
      setEditing(false);
      toast("Saved", { tone: "success" });
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className={cn("group/body relative", className)}>
        {value ? (
          <MarkdownView body={value} />
        ) : (
          <p className="text-[14px] text-muted-foreground">{placeholder}</p>
        )}
        <button
          onClick={() => {
            setBody(value ?? "");
            setEditing(true);
          }}
          className={cn(
            "pressable absolute -right-1 -top-1 flex items-center gap-1.5 rounded-md bg-card px-2 py-1",
            "text-[12px] text-muted-foreground opacity-0 shadow-xs ring-1 ring-hairline transition-opacity",
            "hover:text-foreground group-hover/body:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Pencil className="h-3 w-3" />
          {value ? "Edit" : emptyPrompt}
        </button>
      </div>
    );
  }

  const editor = (
    <RichTextEditor
      value={body}
      onChange={setBody}
      autoFocus
      className="border-0 shadow-none ring-0 focus-within:ring-0"
      placeholder="Markdown. # headings, - lists, [links](https://…), > quotes, `code`."
    />
  );

  return (
    <div className={cn("space-y-2", className)}>
      {onAttach ? (
        <ImageDropzone
          images={images}
          onChange={(next) => {
            setImages(next);
            // Inserted at the end as markdown so it shows where it landed
            // instead of being found only after saving.
            const added = next.slice(images.length);
            if (added.length) {
              setBody(
                (b) =>
                  `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}` +
                  added.map((i) => `![${i.fileName}](${i.dataUrl})`).join("\n"),
              );
            }
          }}
          max={12}
          hint="paste or drop images — they land at the end"
        >
          {editor}
        </ImageDropzone>
      ) : (
        editor
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setBody(value ?? "");
            setImages([]);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
