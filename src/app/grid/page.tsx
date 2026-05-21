import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";
import { MasonryGrid } from "@/components/grid/MasonryGrid";
import { SortMenu, type SortValue } from "@/components/grid/SortMenu";

const VALID_SORTS = new Set<SortValue>([
  "newest",
  "oldest",
  "priority-desc",
  "priority-asc",
  "title",
]);

function parseSort(raw: string | string[] | undefined): SortValue {
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return v && VALID_SORTS.has(v as SortValue) ? (v as SortValue) : "newest";
}

function orderBy(sort: SortValue) {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" as const };
    case "priority-desc":
      return [{ priority: "desc" as const }, { createdAt: "desc" as const }];
    case "priority-asc":
      return [{ priority: "asc" as const }, { createdAt: "desc" as const }];
    case "title":
      return { title: "asc" as const };
    case "newest":
    default:
      return { createdAt: "desc" as const };
  }
}

export default async function GridPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await requireSession();
  const { sort: sortRaw } = await searchParams;
  const sort = parseSort(sortRaw);

  const posts = await db.post.findMany({
    orderBy: orderBy(sort),
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      imageUrl: true,
      category: true,
      todo: true,
      painPoint: true,
      priority: true,
      createdAt: true,
      author: { select: { id: true, email: true, name: true } },
    },
  });

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container py-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Ideas</h1>
            <p className="text-xs text-muted-foreground">
              {posts.length} {posts.length === 1 ? "post" : "posts"}
            </p>
          </div>
          <SortMenu value={sort} />
        </div>
        <MasonryGrid posts={posts} />
      </main>
    </div>
  );
}
