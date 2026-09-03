"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ModalContent } from "@/components/ui/modal";

import type { BoardColumn } from "./types";

/**
 * Deleting a column must never delete the work in it, so when the column still
 * holds cards this asks where they go rather than warning that they'll be lost.
 * The database backs it up: the FK is `onDelete: Restrict`.
 */
export function DeleteColumnDialog({
  column,
  columns,
  cardCount,
  onClose,
  onConfirm,
}: {
  column: BoardColumn | null;
  columns: BoardColumn[];
  cardCount: number;
  onClose: () => void;
  onConfirm: (id: string, moveCardsTo?: string) => void;
}) {
  const others = columns.filter((c) => c.id !== column?.id);
  const [target, setTarget] = useState("");
  const destination = target || others[0]?.id;

  return (
    <DialogPrimitive.Root open={Boolean(column)} onOpenChange={(o) => !o && onClose()}>
      <ModalContent
        open={Boolean(column)}
        size="sm"
        title={column ? `Delete “${column.name}”?` : "Delete column"}
      >
        {column && (
          <div className="space-y-4">
            {cardCount > 0 ? (
              <>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  It still holds {cardCount} card{cardCount === 1 ? "" : "s"}. They’ll be moved,
                  not deleted — pick where they should go.
                </p>
                <div>
                  <label htmlFor="move-to" className="mb-1.5 block text-[13px] font-medium">
                    Move cards to
                  </label>
                  <select
                    id="move-to"
                    value={destination}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-9 w-full rounded-md bg-card px-3 text-[14px] shadow-xs ring-1 ring-inset ring-input focus:outline-none focus:ring-2 focus:ring-primary/70"
                  >
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                It’s empty, so nothing will be lost.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={cardCount > 0 && !destination}
                onClick={() => onConfirm(column.id, cardCount > 0 ? destination : undefined)}
              >
                Delete column
              </Button>
            </div>
          </div>
        )}
      </ModalContent>
    </DialogPrimitive.Root>
  );
}
