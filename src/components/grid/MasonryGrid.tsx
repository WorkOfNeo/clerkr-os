import { PostCard } from "./PostCard";

interface Post {
  id: string;
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  todo: string | null;
  painPoint: string | null;
  priority: number;
  createdAt: Date;
  author: { id: string; email: string; name: string };
}

export function MasonryGrid({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-sm font-medium">No posts yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Generate an API token under{" "}
          <span className="font-mono">/settings</span> and ask Claude to add a
          URL to the board.
        </p>
      </div>
    );
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
