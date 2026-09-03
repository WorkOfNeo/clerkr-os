"use client";

import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { Download, FolderInput, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { deleteDocument, updateDocument } from "@/app/documents/actions";
import { DocumentIcon } from "@/components/document/DocumentIcon";
import { DocumentPreview, type PreviewDoc } from "@/components/document/DocumentPreview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ModalContent } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { formatBytes } from "@/lib/documents/file-types";
import { formatShortDate } from "@/lib/format";

export interface DocumentListItem {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  tags: string[];
  createdAt: Date | string;
  folder: { id: string; slug: string; name: string; color: string | null } | null;
  uploadedBy: { id: string; email: string; name: string } | null;
}

export interface FolderChoice {
  id: string;
  name: string;
}

export function DocumentList({
  documents,
  folders,
}: {
  documents: DocumentListItem[];
  folders: FolderChoice[];
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [editing, setEditing] = useState<DocumentListItem | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(doc: DocumentListItem, folderId: string | null) {
    startTransition(async () => {
      await updateDocument({ id: doc.id, folderId });
      toast(folderId ? "Moved" : "Removed from folder", { tone: "success" });
    });
  }

  function remove(doc: DocumentListItem) {
    startTransition(async () => {
      await deleteDocument(doc.id);
      toast(`Deleted ${doc.fileName}`, { tone: "success" });
    });
  }

  return (
    <>
      <div className="surface divide-y divide-hairline overflow-hidden p-0">
        {documents.map((doc) => (
          <motion.div
            key={doc.id}
            layout
            className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/40"
          >
            <button
              type="button"
              onClick={() => setPreview(doc)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <DocumentIcon mimeType={doc.mimeType} fileName={doc.fileName} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium">{doc.title}</span>
                  {doc.folder && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `${doc.folder.color ?? "#8E8E93"}1f`,
                        color: doc.folder.color ?? undefined,
                      }}
                    >
                      {doc.folder.name}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  <span className="truncate">{doc.fileName}</span>
                  <span>·</span>
                  <span className="tabular-nums">{formatBytes(doc.byteSize)}</span>
                  <span>·</span>
                  <span>{formatShortDate(doc.createdAt)}</span>
                  {doc.uploadedBy && (
                    <>
                      <span>·</span>
                      <span className="truncate">{doc.uploadedBy.name || doc.uploadedBy.email}</span>
                    </>
                  )}
                </span>
                {doc.description && (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground/80">
                    {doc.description}
                  </span>
                )}
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                asChild
                size="icon-sm"
                variant="ghost"
                title={`Download ${doc.fileName}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <a href={`/api/documents/${doc.id}?download=1`} download={doc.fileName}>
                  <Download className="h-3.5 w-3.5" />
                </a>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${doc.title}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setEditing(doc)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Rename & describe
                  </DropdownMenuItem>

                  {folders.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FolderInput className="h-3.5 w-3.5" />
                        Move to
                      </DropdownMenuLabel>
                      {folders.map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          disabled={doc.folder?.id === f.id || isPending}
                          onSelect={() => move(doc, f.id)}
                        >
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                      {doc.folder && (
                        <DropdownMenuItem onSelect={() => move(doc, null)}>
                          No folder
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => remove(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        ))}
      </div>

      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
      <EditDialog doc={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** Rename and describe. The file name itself is intentionally NOT editable —
 *  it carries the extension every downstream app relies on. */
function EditDialog({ doc, onClose }: { doc: DocumentListItem | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <ModalContent open={Boolean(doc)} title="Edit document">
        {/* Keyed so the form's state is seeded from whichever row was opened —
            without the remount, opening a second document would show the
            first one's values. */}
        {doc && <EditForm key={doc.id} doc={doc} onClose={onClose} />}
      </ModalContent>
    </DialogPrimitive.Root>
  );
}

function EditForm({ doc, onClose }: { doc: DocumentListItem; onClose: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  // Seeded from the row, so a field left untouched saves what it already said
  // rather than clearing it.
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [tags, setTags] = useState(doc.tags.join(", "));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await updateDocument({
            id: doc.id,
            title: title.trim() || doc.fileName,
            description: description.trim() || null,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          });
          toast("Saved", { tone: "success" });
          onClose();
        });
      }}
      className="space-y-3"
    >
      <div>
        <label className="mb-1 block text-[13px] font-medium">Name</label>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={doc.fileName}
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this, and why did we keep it?"
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-medium">Tags</label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="contract, acme, 2026"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
