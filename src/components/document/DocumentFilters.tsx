"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FolderPlus, Search, X } from "lucide-react";

import { createDocumentFolder } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { DOCUMENT_KINDS } from "@/lib/documents/file-types";

export interface FolderFilterOption {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  count: number;
}

export function DocumentFilters({
  folderSlug,
  kind,
  query,
  folders,
  total,
}: {
  folderSlug?: string;
  kind?: string;
  query?: string;
  folders: FolderFilterOption[];
  total: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState(query ?? "");
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setQ(query ?? ""), [query]);

  function href(next: { folder?: string; kind?: string; q?: string }) {
    const sp = new URLSearchParams();
    const merged = { folder: folderSlug, kind, q: query, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/documents?${s}` : "/documents";
  }

  // Debounced so typing doesn't fire a server round-trip per keystroke.
  useEffect(() => {
    const current = query ?? "";
    if (q === current) return;
    const t = setTimeout(() => router.push(href({ q: q || undefined })), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 space-y-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, description or tag…"
          className="pl-9"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="pressable absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          layoutId="doc-folder-filter"
          size="sm"
          value={folderSlug ?? ""}
          onChange={(v) => router.push(href({ folder: v || undefined }))}
          segments={[
            { value: "", label: "All", count: total },
            ...folders.map((f) => ({
              value: f.slug,
              label: f.name,
              count: f.count,
              color: f.color ?? undefined,
            })),
          ]}
        />

        <Segmented
          layoutId="doc-kind-filter"
          size="sm"
          value={kind ?? ""}
          onChange={(v) => router.push(href({ kind: v || undefined }))}
          segments={[
            { value: "", label: "Any type" },
            ...DOCUMENT_KINDS.map((k) => ({ value: k.value, label: k.label })),
          ]}
        />

        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (!name) return;
              startTransition(async () => {
                try {
                  const folder = await createDocumentFolder({ name });
                  setCreating(false);
                  toast(`Folder “${folder.name}” created`, { tone: "success" });
                  router.push(href({ folder: folder.slug }));
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Could not create that folder.", {
                    tone: "error",
                  });
                }
              });
            }}
            className="flex items-center gap-1.5"
          >
            <Input
              name="name"
              autoFocus
              placeholder="Folder name"
              className="h-8 w-40 text-[13px]"
              onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            />
            <Button type="submit" size="xs" disabled={isPending}>
              Add
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setCreating(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New folder
          </Button>
        )}
      </div>
    </div>
  );
}
