"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, ImagePlus, Link2, Pencil, Trash2 } from "lucide-react";

import {
  addCardAttachments,
  deleteCard,
  deleteCardAttachment,
  moveCard,
  updateCard,
} from "@/app/kanban/actions";
import { ImageDropzone, type PendingImage } from "@/components/attachments/ImageDropzone";
import { ColumnIcon } from "@/components/kanban/ColumnIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetContent } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/wiki/MarkdownView";
import { formatISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { BoardCard, BoardColumn } from "./types";

/**
 * The card, opened.
 *
 * The body is plain markdown, the same as a wiki note — rendered with the
 * shared MarkdownView so links, headings, lists, quotes and images all behave
 * identically wherever they're written. A card is "anything", so the body has
 * to be a document rather than a description field.
 *
 * Images pasted here are stored as attachments and inserted into the body as
 * markdown pointing at the auth-gated serve route, so they render inline and
 * still can't be read by anyone without a session.
 */
export function CardPanel({
  card,
  columns,
  onClose,
}: {
  card: BoardCard | null;
  columns: BoardColumn[];
  onClose: () => void;
}) {
  return (
    <SheetContent
      open={Boolean(card)}
      onClose={onClose}
      title={card ? `#${card.number}` : "Card"}
      description={card?.title}
    >
      {card && <Body key={card.id} card={card} columns={columns} onClose={onClose} />}
    </SheetContent>
  );
}

function Body({
  card,
  columns,
  onClose,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(formatISODate(card.dueDate));
  const [themeTag, setThemeTag] = useState(card.themeTag ?? "");
  const [blocked, setBlocked] = useState(card.blocked);
  const [blockerNote, setBlockerNote] = useState(card.blockerNote ?? "");
  const [editing, setEditing] = useState(!card.description);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const column = columns.find((c) => c.id === card.columnId);

  function save() {
    startTransition(async () => {
      await updateCard({
        id: card.id,
        title: title.trim() || card.title,
        description: body.trim() || null,
        dueDate: dueDate || null,
        themeTag: themeTag.trim() || null,
        blocked,
        blockerNote: blocked ? blockerNote.trim() || null : null,
      });
      toast("Saved", { tone: "success" });
      router.refresh();
    });
  }

  /** Upload the staged screenshots, then append them to the body as markdown
   *  so they render in the document rather than sitting in a separate tray. */
  function attach() {
    if (!pendingImages.length) return;
    const staged = pendingImages;
    setPendingImages([]);
    startTransition(async () => {
      await addCardAttachments(
        card.id,
        staged.map((i) => ({
          dataUrl: i.dataUrl,
          fileName: i.fileName,
          ...(i.width ? { width: i.width } : {}),
          ...(i.height ? { height: i.height } : {}),
        })),
      );
      toast(`${staged.length} image${staged.length === 1 ? "" : "s"} attached`, {
        tone: "success",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          className="h-auto border-0 bg-transparent px-0 text-[17px] font-semibold tracking-[-0.02em] shadow-none ring-0 focus:ring-0"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {column && (
            <span className="inline-flex items-center gap-1.5">
              <ColumnIcon name={column.icon} color={column.color} className="h-3 w-3" />
              {column.name}
            </span>
          )}
          {card.completedAt && <span className="text-success">done</span>}
        </div>
      </div>

      {/* Move between columns without going back to the board. */}
      <div className="flex flex-wrap gap-1">
        {columns.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              startTransition(async () => {
                await moveCard({ id: card.id, columnId: c.id, order: Date.now() });
                router.refresh();
              })
            }
            disabled={c.id === card.columnId || isPending}
            className={cn(
              "pressable rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
              c.id === card.columnId
                ? "bg-card shadow-xs ring-1 ring-hairline"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium">Notes</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (editing) save();
              setEditing((e) => !e);
            }}
          >
            {editing ? (
              <>
                <Eye className="h-3 w-3" />
                Preview
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                Edit
              </>
            )}
          </Button>
        </div>

        {editing ? (
          <ImageDropzone
            images={pendingImages}
            onChange={(next) => {
              setPendingImages(next);
              // Insert as markdown the moment one is dropped, so the writer
              // sees where it landed instead of hunting for it after saving.
              const added = next.slice(pendingImages.length);
              if (added.length) {
                setBody(
                  (b) =>
                    `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}` +
                    added.map((i) => `![${i.fileName}](${i.dataUrl})`).join("\n"),
                );
              }
            }}
            max={12}
            hint="paste or drop images — they're inserted where the cursor left off"
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              placeholder={"Markdown. # headings, - lists, [links](https://…), ![images](…), > quotes, `code`."}
              className="min-h-[220px] resize-y border-0 bg-transparent shadow-none ring-0 focus:ring-0"
            />
          </ImageDropzone>
        ) : body ? (
          <div className="rounded-md bg-card p-3 shadow-xs ring-1 ring-inset ring-hairline">
            <MarkdownView body={body} />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-md border border-dashed border-hairline py-8 text-[13px] text-muted-foreground hover:text-foreground"
          >
            Add notes — markdown, images, links
          </button>
        )}

        {editing && pendingImages.length > 0 && (
          <Button size="xs" className="mt-2" onClick={attach} disabled={isPending}>
            <ImagePlus className="h-3 w-3" />
            Upload {pendingImages.length} image{pendingImages.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="card-due" className="mb-1.5 block text-[13px] font-medium">
            Due
          </label>
          <Input
            id="card-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={save}
          />
        </div>
        <div>
          <label htmlFor="card-theme" className="mb-1.5 block text-[13px] font-medium">
            Theme
          </label>
          <Input
            id="card-theme"
            value={themeTag}
            onChange={(e) => setThemeTag(e.target.value)}
            onBlur={save}
            placeholder="e.g. growth"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 p-3">
        <input
          type="checkbox"
          checked={blocked}
          onChange={(e) => {
            setBlocked(e.target.checked);
            startTransition(async () => {
              await updateCard({ id: card.id, blocked: e.target.checked });
              router.refresh();
            });
          }}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">Blocked</span>
          {blocked && (
            <Input
              value={blockerNote}
              onChange={(e) => setBlockerNote(e.target.value)}
              onBlur={save}
              placeholder="What's it waiting on?"
              className="mt-1.5 h-8 text-[13px]"
            />
          )}
        </span>
      </label>

      {card.attachments.length > 0 && (
        <div>
          <span className="mb-1.5 block text-[13px] font-medium">
            Attachments ({card.attachments.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {card.attachments.map((a) => (
              <div key={a.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/attachments/${a.id}`}
                  alt={a.fileName}
                  className="h-20 w-20 rounded-sm object-cover ring-1 ring-hairline"
                />
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCardAttachment(a.id);
                      router.refresh();
                    })
                  }
                  aria-label={`Remove ${a.fileName}`}
                  className="pressable absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs shadow-sm ring-1 ring-hairline hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.feature && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Linked to {card.feature.title}
        </p>
      )}

      <div className="flex justify-between border-t border-hairline pt-4">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await deleteCard(card.id);
              toast("Card deleted", { tone: "success" });
              onClose();
              router.refresh();
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
