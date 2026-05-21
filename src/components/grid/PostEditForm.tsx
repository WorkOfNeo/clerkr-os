"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, updatePost } from "@/app/grid/actions";

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
  };
  onDone: () => void;
}

export function PostEditForm({ post, onDone }: Props) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await updatePost(fd);
          onDone();
        } finally {
          setPending(false);
        }
      }}
      className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm"
    >
      <input type="hidden" name="id" value={post.id} />

      <div className="space-y-1">
        <Label htmlFor={`title-${post.id}`}>Title</Label>
        <Input
          id={`title-${post.id}`}
          name="title"
          defaultValue={post.title}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`url-${post.id}`}>URL</Label>
        <Input
          id={`url-${post.id}`}
          name="url"
          type="url"
          defaultValue={post.url}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`imageUrl-${post.id}`}>Image URL</Label>
        <Input
          id={`imageUrl-${post.id}`}
          name="imageUrl"
          type="url"
          defaultValue={post.imageUrl ?? ""}
          placeholder="(leave empty to clear)"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`description-${post.id}`}>Description</Label>
        <Textarea
          id={`description-${post.id}`}
          name="description"
          defaultValue={post.description ?? ""}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`category-${post.id}`}>Category</Label>
          <Input
            id={`category-${post.id}`}
            name="category"
            defaultValue={post.category ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`priority-${post.id}`}>Priority (1–5)</Label>
          <Input
            id={`priority-${post.id}`}
            name="priority"
            type="number"
            min={1}
            max={5}
            defaultValue={post.priority}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`todo-${post.id}`}>Todo / what to build</Label>
        <Textarea
          id={`todo-${post.id}`}
          name="todo"
          defaultValue={post.todo ?? ""}
          rows={2}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`painPoint-${post.id}`}>Pain point</Label>
        <Textarea
          id={`painPoint-${post.id}`}
          name="painPoint"
          defaultValue={post.painPoint ?? ""}
          rows={2}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <DeleteButton id={post.id} onDone={onDone} />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (fd) => {
        if (!confirm("Delete this post? This can also be done from Claude via the MCP.")) {
          return;
        }
        setPending(true);
        try {
          await deletePost(fd);
          onDone();
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "Deleting..." : "Delete"}
      </Button>
    </form>
  );
}
