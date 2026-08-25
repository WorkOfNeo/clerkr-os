export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

/**
 * Thumbnails for stored attachments. `src` points at the auth-gated serve
 * route rather than inlining bytes, so a ticket with ten screenshots doesn't
 * ship ten megabytes of HTML.
 */
export function AttachmentGrid({ attachments }: { attachments: AttachmentView[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={`/api/attachments/${a.id}`}
          target="_blank"
          rel="noreferrer"
          title={`${a.fileName} · ${Math.round(a.byteSize / 1024)}KB`}
          className="block overflow-hidden rounded border transition-colors hover:border-foreground/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/attachments/${a.id}`}
            alt={a.fileName}
            className="h-24 w-24 object-cover"
          />
        </a>
      ))}
    </div>
  );
}
