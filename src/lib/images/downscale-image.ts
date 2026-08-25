"use client";

// Browser-only. Shrinks an image before it's sent to the server so the bytes
// we put in Postgres stay small — no `sharp`, no native dependency.
// (Pattern from wiki cmquudjcd001ypf159yd5frw8.)

const MAX_EDGE = 2000;
const TARGET_BYTES = 1.5 * 1024 * 1024;

export interface DownscaledImage {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isAcceptedImage(file: File | null | undefined): file is File {
  return Boolean(file && ACCEPTED_TYPES.includes(file.type));
}

function approxBytes(dataUrl: string): number {
  // base64 is 4 chars per 3 bytes; close enough to compare against a target.
  const body = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((body.length * 3) / 4);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

export async function downscaleImage(file: File): Promise<DownscaledImage> {
  // Animated GIFs would lose their animation on a canvas round-trip, so if it's
  // already small enough, pass the original bytes straight through.
  if (file.type === "image/gif") {
    return {
      dataUrl: await fileToDataUrl(file),
      fileName: file.name || "pasted.gif",
      width: 0,
      height: 0,
    };
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, width, height);

  // Screenshots are the common case here and PNG keeps text crisp — only fall
  // back to JPEG when the PNG is genuinely too heavy.
  let dataUrl = canvas.toDataURL("image/png");
  if (approxBytes(dataUrl) > TARGET_BYTES) {
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (approxBytes(dataUrl) <= TARGET_BYTES) break;
    }
  }

  const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
  const base = (file.name || "").replace(/\.[^.]+$/, "");
  return {
    dataUrl,
    fileName: `${base || `screenshot-${Date.now()}`}.${ext}`,
    width,
    height,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Pull images out of a paste. A screenshot on the clipboard arrives as a
 * `kind: "file"` item on both macOS (⌘V after ⌃⇧⌘4) and Windows (Ctrl+V after
 * Snipping Tool / PrtScn) — the ClipboardEvent shape is identical, so this
 * needs no per-platform branch.
 */
export function imagesFromClipboard(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const data = "clipboardData" in e ? e.clipboardData : null;
  if (!data) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (isAcceptedImage(file)) files.push(file);
  }
  return files;
}

export function imagesFromDrop(e: React.DragEvent): File[] {
  return Array.from(e.dataTransfer?.files ?? []).filter(isAcceptedImage);
}
