// Server-side decode of the `data:` URLs the client sends after downscaling.
// Images ride inline in the normal server-action payload — no separate upload
// endpoint, so there are no orphan rows to garbage-collect.
// (Pattern from wiki cmquudjcd001ypf159yd5frw8.)

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// Post-downscale images are a few hundred KB. This is a backstop against a
// hand-crafted payload, not the normal path.
const MAX_BYTES = 6 * 1024 * 1024;

export interface DecodedImage {
  // Must be the NARROW Buffer<ArrayBuffer>, not plain Buffer: Prisma's Bytes
  // input is Uint8Array<ArrayBuffer>, and widening to Buffer<ArrayBufferLike>
  // fails tsc. `Buffer.from(str, "base64")` already returns the narrow type —
  // the annotation just has to not throw it away (wiki cmquudjcd001ypf159yd5frw8).
  data: Buffer<ArrayBuffer>;
  mimeType: string;
  fileName: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

export interface ImageAttachmentInput {
  dataUrl: string;
  fileName?: string;
  width?: number;
  height?: number;
}

export function decodeImageDataUrl(input: ImageAttachmentInput): DecodedImage {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(input.dataUrl.trim());
  if (!match) throw new Error("Attachment is not a base64 data URL.");

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const data = Buffer.from(match[2], "base64");
  if (data.byteLength === 0) throw new Error("Attachment is empty.");
  if (data.byteLength > MAX_BYTES) {
    throw new Error(`Attachment is too large (${Math.round(data.byteLength / 1024)}KB).`);
  }

  return {
    data,
    mimeType,
    fileName: (input.fileName || `pasted-${mimeType.split("/")[1] ?? "png"}`).slice(0, 200),
    byteSize: data.byteLength,
    width: input.width ?? null,
    height: input.height ?? null,
  };
}

export function decodeImageAttachments(inputs: ImageAttachmentInput[]): DecodedImage[] {
  return inputs.map(decodeImageDataUrl);
}
