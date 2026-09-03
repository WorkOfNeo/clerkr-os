// Everything about "what kind of file is this" lives here so the upload path,
// the serve route and the UI all agree.

/** Browsers leave `File.type` empty for plenty of real formats, so fall back to
 *  the extension before giving up and calling it a binary blob. */
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  key: "application/vnd.apple.keynote",
  pages: "application/vnd.apple.pages",
  numbers: "application/vnd.apple.numbers",
  zip: "application/zip",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};

export const FALLBACK_MIME = "application/octet-stream";

export function extensionOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

export function resolveMimeType(fileName: string, declared?: string | null): string {
  const clean = declared?.trim().toLowerCase();
  if (clean && clean !== FALLBACK_MIME && /^[a-z]+\/[a-z0-9.+-]+$/.test(clean)) return clean;
  return EXT_MIME[extensionOf(fileName)] ?? FALLBACK_MIME;
}

/**
 * Types we're willing to render inline, same-origin, in the user's browser.
 *
 * Deliberately an allowlist. Serving an uploaded file `inline` hands it our
 * origin, so an HTML file — or an SVG, which can carry <script> — would run as
 * us against the session cookie. Everything not on this list downloads instead.
 * SVG is absent on purpose: it is an image, and it is also a script host.
 */
const INLINE_SAFE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "text/plain",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

export function canRenderInline(mimeType: string): boolean {
  return INLINE_SAFE.has(mimeType.toLowerCase());
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/") && canRenderInline(mimeType);
}

export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** Coarse bucket used for the type filter and the file icon. */
export type DocumentKind = "pdf" | "image" | "doc" | "sheet" | "slides" | "archive" | "av" | "other";

export function documentKind(mimeType: string, fileName = ""): DocumentKind {
  const mime = mimeType.toLowerCase();
  const ext = extensionOf(fileName);
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return "av";
  if (["xlsx", "xls", "csv", "numbers"].includes(ext) || mime.includes("spreadsheet")) return "sheet";
  if (["pptx", "ppt", "key"].includes(ext) || mime.includes("presentation")) return "slides";
  if (["docx", "doc", "pages", "rtf", "txt", "md"].includes(ext) || mime.startsWith("text/") || mime.includes("word"))
    return "doc";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext) || mime.includes("zip")) return "archive";
  return "other";
}

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Images" },
  { value: "doc", label: "Docs" },
  { value: "sheet", label: "Sheets" },
  { value: "slides", label: "Slides" },
  { value: "av", label: "Media" },
  { value: "archive", label: "Archives" },
  { value: "other", label: "Other" },
];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** RFC 5987 filename for Content-Disposition — non-ASCII names (æ, ø, å) would
 *  otherwise arrive mangled or break the header outright. */
export function contentDisposition(fileName: string, disposition: "inline" | "attachment"): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
