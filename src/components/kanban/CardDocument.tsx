"use client";

import { useId, useRef, useState } from "react";

import { addCardAttachments } from "@/app/kanban/actions";
import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Tab = "document" | "markdown";

/**
 * A card's note: one document, two views of it.
 *
 * **Document** is the rendered page, and it's where you write — "# " makes a
 * heading, "- " a list, "[ ] " a checkbox, "> " a quote, "```" a code block.
 * There's no preview step because what you see is already the preview.
 * **Markdown** is the same text as stored, for when you want the source:
 * pasting a long doc, fixing a table, copying it somewhere else.
 *
 * Screenshots dropped or pasted in are uploaded as attachments first and then
 * linked into the note by URL, so the note stays text.
 */
export function CardDocument({
  cardId,
  value,
  onChange,
  onBlur,
  status,
  size = "sheet",
}: {
  cardId: string;
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  /** Rendered at the end of the tab row — the save state. */
  status?: React.ReactNode;
  size?: "sheet" | "page";
}) {
  const [tab, setTab] = useState<Tab>("document");
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const layoutId = `card-doc-tab-${useId()}`;

  // The upload resolves after the user may have typed more; append to the
  // newest text, not the text at the moment of the drop.
  const valueRef = useRef(value);
  valueRef.current = value;

  async function upload(images: PendingImage[]) {
    if (!images.length) return;
    setUploading(true);
    try {
      const rows = await addCardAttachments(
        cardId,
        images.map((i) => ({
          dataUrl: i.dataUrl,
          fileName: i.fileName,
          ...(i.width ? { width: i.width } : {}),
          ...(i.height ? { height: i.height } : {}),
        })),
      );
      const current = valueRef.current;
      const links = rows.map((r) => `![${r.fileName}](/api/attachments/${r.id})`).join("\n\n");
      onChange(`${current}${current && !current.endsWith("\n") ? "\n\n" : ""}${links}`);
    } catch {
      toast("Couldn't upload that image.", { tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  const minHeight = size === "page" ? "min-h-[55vh]" : "min-h-[200px]";

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <Segmented
          size="sm"
          layoutId={layoutId}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          segments={[
            { value: "document", label: "Document" },
            { value: "markdown", label: "Markdown" },
          ]}
        />
        {status && <span className="ml-auto text-[11.5px] text-muted-foreground">{status}</span>}
      </div>

      <ImageDropzone
        images={[]}
        onChange={(next) => void upload(next)}
        max={12}
        hint={
          uploading
            ? "Uploading…"
            : tab === "document"
              ? "# heading · - list · [ ] checkbox · > quote — paste or drop images"
              : "Markdown source — paste or drop images"
        }
      >
        {tab === "document" ? (
          <RichTextEditor
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            minHeightClass={minHeight}
            className={cn(
              "rounded-none border-0 shadow-none ring-0 focus-within:ring-0",
              size === "page" && "px-5 py-4 text-[15px]",
            )}
          />
        ) : (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            spellCheck={false}
            placeholder={"# Heading\n\n- [ ] a checkbox\n- a bullet"}
            className={cn(
              "resize-y rounded-none font-mono text-[13px] leading-relaxed shadow-none ring-0 focus:ring-0",
              minHeight,
              size === "page" && "px-5 py-4",
            )}
          />
        )}
      </ImageDropzone>
    </div>
  );
}
