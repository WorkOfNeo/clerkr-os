"use client";

import { Download, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ModalContent } from "@/components/ui/modal";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DocumentIcon } from "@/components/document/DocumentIcon";
import { canRenderInline, formatBytes, isImage, isPdf } from "@/lib/documents/file-types";

export interface PreviewDoc {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

/**
 * Look at a file without leaving the list. Images and PDFs render inline;
 * everything else gets an honest "no preview" card with a download button
 * rather than a broken embed.
 *
 * The <iframe> is fine to point at our own serve route: that route refuses to
 * send anything but a known-inert type as `inline`, and stamps a locked-down
 * CSP on what it does send.
 */
export function DocumentPreview({
  doc,
  onClose,
}: {
  doc: PreviewDoc | null;
  onClose: () => void;
}) {
  const src = doc ? `/api/documents/${doc.id}` : "";

  return (
    <DialogPrimitive.Root open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <ModalContent open={Boolean(doc)} size="lg" title={doc?.title}>
        {doc && (
          <>
            <div className="-mt-2 mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span className="truncate">{doc.fileName}</span>
              <span>·</span>
              <span>{formatBytes(doc.byteSize)}</span>
            </div>

            <div className="overflow-hidden rounded-lg bg-muted/40 ring-1 ring-hairline">
              {isImage(doc.mimeType) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={src}
                  alt={doc.title}
                  className="mx-auto max-h-[58vh] w-auto max-w-full object-contain"
                />
              ) : isPdf(doc.mimeType) ? (
                <iframe src={src} title={doc.title} className="h-[58vh] w-full bg-card" />
              ) : canRenderInline(doc.mimeType) && doc.mimeType.startsWith("video/") ? (
                <video src={src} controls className="max-h-[58vh] w-full bg-black" />
              ) : canRenderInline(doc.mimeType) && doc.mimeType.startsWith("audio/") ? (
                <div className="p-6">
                  <audio src={src} controls className="w-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-10 text-center">
                  <DocumentIcon
                    mimeType={doc.mimeType}
                    fileName={doc.fileName}
                    className="h-12 w-12"
                  />
                  <p className="text-[14px] font-medium">No preview for this type</p>
                  <p className="text-[13px] text-muted-foreground">
                    Download it to open in the app that owns it.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={`${src}?download=1`} download={doc.fileName}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
              {canRenderInline(doc.mimeType) && (
                <Button asChild size="sm" variant="outline">
                  <a href={src} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in new tab
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </ModalContent>
    </DialogPrimitive.Root>
  );
}
