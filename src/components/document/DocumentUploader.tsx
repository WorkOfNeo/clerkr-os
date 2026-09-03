"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/documents/file-types";
import { cn } from "@/lib/utils";

interface Upload {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export interface FolderOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Intake for the document store: drop, pick, or paste. Anything goes in — the
 * only filter is the size ceiling, because "everything you can name" was the
 * point.
 *
 * Uploads go one file at a time to PUT /api/documents/upload with the file as
 * the raw request body. XMLHttpRequest rather than fetch purely for
 * `upload.onprogress`: fetch still can't report request progress, and a 40MB
 * PDF uploading behind a spinner with no bar is indistinguishable from a hang.
 */
export function DocumentUploader({
  folders,
  activeFolderSlug,
}: {
  folders: FolderOption[];
  activeFolderSlug?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [folderSlug, setFolderSlug] = useState(activeFolderSlug ?? "");
  const [maxBytes, setMaxBytes] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = uploads.some((u) => u.status === "uploading");

  useEffect(() => setFolderSlug(activeFolderSlug ?? ""), [activeFolderSlug]);

  // Show the ceiling before someone picks a 2GB video, not after.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents/upload")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setMaxBytes(d.maxBytes))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Resolves true on success — the caller counts failures from the return
   *  value rather than re-reading state it would only see stale. */
  const uploadOne = useCallback(
    (file: File, key: string, folder: string) =>
      new Promise<boolean>((resolve) => {
        const params = new URLSearchParams({ name: file.name });
        if (file.type) params.set("type", file.type);
        if (folder) params.set("folder", folder);

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/documents/upload?${params}`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress } : u)));
        };
        const fail = (message: string) => {
          setUploads((list) =>
            list.map((u) => (u.key === key ? { ...u, status: "error", error: message } : u)),
          );
          resolve(false);
        };
        xhr.onload = () => {
          let payload: { document?: unknown; error?: string } | null = null;
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* not JSON — handled below */
          }

          // A 2xx alone isn't proof: an expired session makes the middleware
          // 307 to /signin, XHR follows it silently, and the sign-in PAGE comes
          // back as a perfectly good 200. Only a body carrying `document` means
          // the file actually landed.
          if (xhr.status >= 200 && xhr.status < 300 && payload?.document) {
            setUploads((list) =>
              list.map((u) => (u.key === key ? { ...u, status: "done", progress: 100 } : u)),
            );
            resolve(true);
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            fail("Session expired — sign in again and retry.");
            return;
          }
          fail(payload?.error ?? `Upload failed (${xhr.status})`);
        };
        xhr.onerror = () => fail("Connection lost during upload.");
        xhr.send(file);
      }),
    [],
  );

  const ingest = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const tooBig = maxBytes ? files.filter((f) => f.size > maxBytes) : [];
      const accepted = maxBytes ? files.filter((f) => f.size <= maxBytes) : files;
      for (const f of tooBig) {
        toast(`${f.name} is over the ${formatBytes(maxBytes!)} limit.`, { tone: "error" });
      }
      if (!accepted.length) return;

      const queued: Upload[] = accepted.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        progress: 0,
        status: "uploading",
      }));
      setUploads((list) => [...list, ...queued]);

      // Sequential: parallel uploads of large files just compete for the same
      // uplink and make every individual progress bar crawl.
      let failed = 0;
      for (let i = 0; i < accepted.length; i++) {
        if (!(await uploadOne(accepted[i], queued[i].key, folderSlug))) failed++;
      }

      router.refresh();
      if (failed === 0) {
        toast(`${queued.length} file${queued.length === 1 ? "" : "s"} stored`, { tone: "success" });
        // Leave the failures on screen — a red row nobody sees is a lost file.
        setTimeout(() => {
          setUploads((list) => list.filter((u) => !queued.some((q) => q.key === u.key)));
        }, 2200);
      }
    },
    [folderSlug, maxBytes, router, toast, uploadOne],
  );

  // Paste a file from anywhere on the page — the same reflex that puts
  // screenshots on tickets.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length) {
        e.preventDefault();
        void ingest(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingest]);

  return (
    <div className="mb-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Only clear when the pointer actually leaves the zone, not when it
          // crosses onto a child element.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(Array.from(e.dataTransfer?.files ?? []));
        }}
        className={cn(
          "surface flex flex-col items-center gap-2 border-dashed px-6 py-8 text-center transition-colors duration-150",
          dragging && "border-solid ring-2 ring-primary",
        )}
      >
        <UploadCloud
          className={cn(
            "h-6 w-6 transition-colors",
            dragging ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div>
          <p className="text-[15px] font-medium">
            {dragging ? "Drop to upload" : "Drop files here"}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            PDFs, images, spreadsheets, decks — anything. Paste works too.
            {maxBytes ? ` Up to ${formatBytes(maxBytes)} each.` : ""}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void ingest(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose files
          </Button>
          {folders.length > 0 && (
            <select
              value={folderSlug}
              onChange={(e) => setFolderSlug(e.target.value)}
              className="h-8 rounded-sm bg-card px-2 text-[13px] shadow-xs ring-1 ring-inset ring-input focus:outline-none focus:ring-2 focus:ring-primary/70"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {uploads.map((u) => (
          <motion.div
            key={u.key}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
            className="mt-2 flex items-center gap-3 rounded-md bg-card px-3 py-2 shadow-xs ring-1 ring-hairline"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px]">
                <span className="truncate font-medium">{u.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(u.size)}</span>
              </span>
              {u.status === "uploading" && (
                <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full rounded-full bg-primary"
                    animate={{ width: `${u.progress}%` }}
                    transition={{ ease: "linear", duration: 0.2 }}
                  />
                </span>
              )}
              {u.status === "error" && (
                <span className="mt-0.5 block text-xs text-destructive">{u.error}</span>
              )}
            </span>
            {u.status === "done" && <Check className="h-4 w-4 shrink-0 text-success" />}
            {u.status === "error" && (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
            {u.status === "uploading" && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {u.progress}%
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
