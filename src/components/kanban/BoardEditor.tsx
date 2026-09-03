"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createBoard, updateBoard } from "@/app/kanban/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalContent } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

import type { BoardOption } from "./BoardBar";

export function BoardEditor({
  open,
  board,
  onClose,
}: {
  open: boolean;
  board: BoardOption | null;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent
        open={open}
        size="sm"
        title={board ? "Edit board" : "New board"}
        description={
          board
            ? undefined
            : "A board is a whole workflow with its own columns. It opens with the standard set — rename them to match how this one actually runs."
        }
      >
        {open && <Form key={board?.id ?? "new"} board={board} onClose={onClose} />}
      </ModalContent>
    </DialogPrimitive.Root>
  );
}

function Form({ board, onClose }: { board: BoardOption | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Give the board a name.");
      return;
    }
    startTransition(async () => {
      try {
        if (board) {
          await updateBoard({ id: board.id, name: clean, description: description || null });
          toast("Board updated", { tone: "success" });
          onClose();
          router.refresh();
        } else {
          const created = await createBoard({ name: clean, description: description || undefined });
          toast(`“${created.name}” created`, { tone: "success" });
          onClose();
          router.push(`/kanban?board=${created.slug}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save that board.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="board-name" className="mb-1.5 block text-[13px] font-medium">
          Title
        </label>
        <Input
          id="board-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hiring"
        />
      </div>

      <div>
        <label htmlFor="board-desc" className="mb-1.5 block text-[13px] font-medium">
          Description <span className="font-normal text-muted-foreground">— optional</span>
        </label>
        <Textarea
          id="board-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What belongs on this board, and what doesn't."
        />
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : board ? "Save changes" : "Create board"}
        </Button>
      </div>
    </form>
  );
}
