"use client";

import { useState } from "react";
import { ExternalLink, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { PostEditForm } from "./PostEditForm";

interface Props {
  post: {
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
  };
}

export function PostCard({ post }: Props) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={cn(
        "flip-card mb-4 break-inside-avoid",
        flipped && "is-flipped",
      )}
    >
      <div className="flip-inner">
        {/* FRONT */}
        <div className="flip-face relative">
          {post.imageUrl && (
            // Plain <img> — image URLs are arbitrary and we don't want next/image's
            // remote-loader hop.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.imageUrl}
              alt=""
              className="block w-full object-cover"
              loading="lazy"
            />
          )}

          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background"
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>

          {post.priority >= 4 && (
            <div className="absolute left-2 top-2 z-10 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background shadow-sm">
              ★ {post.priority}
            </div>
          )}

          <div className="p-3">
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-1.5 text-sm font-semibold leading-snug hover:underline"
            >
              <span className="line-clamp-3">{post.title}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
            </a>

            {post.description && (
              <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
                {post.description}
              </p>
            )}

            {(post.todo || post.painPoint) && (
              <div className="mt-2 space-y-1 text-xs">
                {post.todo && (
                  <p>
                    <span className="font-medium text-foreground">Todo: </span>
                    <span className="text-muted-foreground">{post.todo}</span>
                  </p>
                )}
                {post.painPoint && (
                  <p>
                    <span className="font-medium text-foreground">Pain: </span>
                    <span className="text-muted-foreground">{post.painPoint}</span>
                  </p>
                )}
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {post.category && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                  {post.category}
                </span>
              )}
              <span title={post.author.email}>{post.author.email.split("@")[0]}</span>
              <span aria-hidden>·</span>
              <span>
                {new Date(post.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className="flip-face flip-back">
          <button
            type="button"
            onClick={() => setFlipped(false)}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow-sm transition hover:bg-background"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <PostEditForm post={post} onDone={() => setFlipped(false)} />
        </div>
      </div>
    </div>
  );
}
