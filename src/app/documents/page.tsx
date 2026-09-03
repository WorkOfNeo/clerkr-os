import type { Metadata } from "next";

import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { DocumentFilters } from "@/components/document/DocumentFilters";
import { DocumentList } from "@/components/document/DocumentList";
import { DocumentUploader } from "@/components/document/DocumentUploader";
import { db } from "@/lib/db";
import { listDocuments } from "@/lib/documents/documents";
import { DOCUMENT_KINDS, formatBytes, type DocumentKind } from "@/lib/documents/file-types";
import { backendLabel } from "@/lib/documents/storage";
import { requireSession } from "@/lib/session";

// The file store: PDFs, images, spreadsheets, decks — the originals, kept
// whole. Distinct from ticket screenshots, which are downscaled on purpose and
// belong to one ticket.

function isKind(v: string | undefined): v is DocumentKind {
  return Boolean(v) && DOCUMENT_KINDS.some((k) => k.value === v);
}

export const metadata: Metadata = {
  title: "Documents",
  description:
    "The file store — PDFs, images, spreadsheets and decks, kept whole.",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; kind?: string; q?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const kind = isKind(params.kind) ? params.kind : undefined;

  const [documents, folders, totals] = await Promise.all([
    listDocuments({ folderSlug: params.folder, kind, query: params.q }),
    db.documentFolder.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        _count: { select: { documents: true } },
      },
    }),
    db.document.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),
  ]);

  const count = totals._count._all;
  const stored = formatBytes(totals._sum.byteSize ?? 0);
  const filtered = Boolean(params.folder || kind || params.q);

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <PageHeader
          title="Documents"
          subtitle={
            count === 0
              ? "Nothing stored yet."
              : `${count} file${count === 1 ? "" : "s"} · ${stored} · kept in ${backendLabel()}`
          }
        />

        <DocumentUploader
          folders={folders.map((f) => ({ id: f.id, slug: f.slug, name: f.name }))}
          activeFolderSlug={params.folder}
        />

        {(count > 0 || filtered) && (
          <DocumentFilters
            folderSlug={params.folder}
            kind={params.kind}
            query={params.q}
            total={count}
            folders={folders.map((f) => ({
              id: f.id,
              slug: f.slug,
              name: f.name,
              color: f.color,
              count: f._count.documents,
            }))}
          />
        )}

        {documents.length === 0 ? (
          <div className="surface flex flex-col items-center gap-1 border-dashed p-14 text-center">
            <p className="text-[15px] font-medium">
              {filtered ? "Nothing matches" : "No documents yet"}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {filtered
                ? "Try a different filter."
                : "Drop a file above — PDF, image, spreadsheet, anything."}
            </p>
          </div>
        ) : (
          <DocumentList
            documents={documents}
            folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          />
        )}
      </main>
    </AppShell>
  );
}
