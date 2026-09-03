"use client";

import { motion } from "motion/react";
import { useState } from "react";

import { Lightbox } from "@/components/ui/lightbox";

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

/**
 * Thumbnails for stored attachments. `src` points at the auth-gated serve route
 * rather than inlining bytes, so a ticket with ten screenshots doesn't ship ten
 * megabytes of HTML. Clicking opens the lightbox instead of dumping the raw
 * bytes into a new browser tab.
 */
export function AttachmentGrid({ attachments }: { attachments: AttachmentView[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {attachments.map((a, i) => (
          <motion.button
            key={a.id}
            type="button"
            onClick={() => setIndex(i)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
            title={`${a.fileName} · ${Math.round(a.byteSize / 1024)}KB`}
            className="group relative overflow-hidden rounded-md shadow-xs ring-1 ring-hairline transition-shadow hover:shadow-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${a.id}`}
              alt={a.fileName}
              loading="lazy"
              className="h-24 w-24 object-cover"
            />
            <span className="absolute inset-0 bg-foreground/0 transition-colors group-hover:bg-foreground/5" />
          </motion.button>
        ))}
      </div>

      <Lightbox
        images={attachments.map((a) => ({ id: a.id, fileName: a.fileName }))}
        index={index}
        onClose={() => setIndex(null)}
        onIndexChange={setIndex}
      />
    </>
  );
}
