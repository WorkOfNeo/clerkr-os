import {
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  PlayCircle,
} from "lucide-react";

import { documentKind, type DocumentKind } from "@/lib/documents/file-types";
import { cn } from "@/lib/utils";

// One glyph and one accent per file family, so the list is scannable by shape
// and colour before you read a single file name.
const ICONS: Record<DocumentKind, { Icon: typeof FileIcon; className: string }> = {
  pdf: { Icon: FileType, className: "text-red-600 bg-red-500/10" },
  image: { Icon: FileImage, className: "text-violet-600 bg-violet-500/10" },
  doc: { Icon: FileText, className: "text-blue-600 bg-blue-500/10" },
  sheet: { Icon: FileSpreadsheet, className: "text-emerald-600 bg-emerald-500/10" },
  slides: { Icon: FileType, className: "text-orange-600 bg-orange-500/10" },
  av: { Icon: PlayCircle, className: "text-pink-600 bg-pink-500/10" },
  archive: { Icon: FileArchive, className: "text-amber-600 bg-amber-500/10" },
  other: { Icon: FileIcon, className: "text-muted-foreground bg-muted" },
};

export function DocumentIcon({
  mimeType,
  fileName,
  className,
}: {
  mimeType: string;
  fileName: string;
  className?: string;
}) {
  const { Icon, className: tone } = ICONS[documentKind(mimeType, fileName)];
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
        tone,
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}
