"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ACCEPTED_TYPES,
  downscaleImage,
  imagesFromClipboard,
  imagesFromDrop,
  type DownscaledImage,
} from "@/lib/images/downscale-image";
import { cn } from "@/lib/utils";

export type PendingImage = DownscaledImage;

/**
 * Screenshot intake, used everywhere images can be attached — tickets, ticket
 * comments, kanban cards and the chat intake box. Three ways in, because the
 * whole point is that capturing something shouldn't be a chore:
 *
 *   - paste (⌘V on macOS, Ctrl+V on Windows) — the primary path, and the
 *     reason this exists. A screenshot on the clipboard arrives as a file item
 *     on the paste event identically on both platforms, so there's no
 *     per-OS branch here.
 *   - drag and drop
 *   - the file picker
 *
 * Everything is downscaled in the browser before it leaves, so what we store
 * stays small.
 */
export function ImageDropzone({
  images,
  onChange,
  disabled,
  max = 8,
  hint,
  children,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
  disabled?: boolean;
  /** How many images this surface accepts. Intake takes a bigger batch than a
   *  bug report does. */
  max?: number;
  hint?: string;
  /** The textarea this dropzone wraps — paste is bound on the wrapper. */
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function ingest(files: File[]) {
    if (!files.length || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...images];
      for (const file of files.slice(0, max - images.length)) {
        next.push(await downscaleImage(file));
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onPaste={(e) => {
        const files = imagesFromClipboard(e);
        // Only swallow the paste when it actually carried an image, so pasting
        // text into the textarea still behaves normally.
        if (files.length) {
          e.preventDefault();
          void ingest(files);
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void ingest(imagesFromDrop(e));
      }}
      className={cn(
        "overflow-hidden rounded-md bg-card shadow-xs ring-1 ring-inset transition-colors duration-150",
        dragging ? "ring-2 ring-primary" : "ring-input",
      )}
    >
      {children}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {images.map((img, i) => (
            <div key={`${img.fileName}-${i}`} className="group/img relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.dataUrl}
                alt={img.fileName}
                className="h-20 w-20 rounded-sm object-cover ring-1 ring-hairline"
              />
              <button
                type="button"
                aria-label={`Remove ${img.fileName}`}
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="pressable absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs leading-none text-muted-foreground shadow-sm ring-1 ring-hairline transition-colors hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void ingest(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          Attach image
        </Button>
        <span>
          {busy
            ? "Processing…"
            : (hint ?? "or paste a screenshot (⌘V / Ctrl+V), or drag them in")}
        </span>
        {images.length > 0 && (
          <span className="ml-auto">
            {images.length} attached{images.length >= max ? " (max)" : ""}
          </span>
        )}
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}
