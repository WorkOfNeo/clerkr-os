"use client";

import { useEffect, useRef, useState } from "react";

import { updateCard } from "@/app/kanban/actions";
import { formatISODate } from "@/lib/format";

import type { BoardCard } from "./types";

export type SaveState = "saved" | "unsaved" | "saving" | "error";

/** How long typing in the note has to pause before it saves itself. */
const AUTOSAVE_MS = 1200;

/**
 * The editable half of a card, shared by the side sheet and the full page so
 * the two can't drift in what they save or when.
 *
 * Fields save on blur, as they always have. The note ALSO saves itself a beat
 * after typing stops — on a full page the note is the document, and "click
 * away to save" is not a rule anyone remembers while writing one. Leaving
 * (closing the sheet, navigating away) flushes a pending save rather than
 * dropping it.
 */
export function useCardDraft(card: BoardCard) {
  const [title, setTitle] = useState(card.title);
  const [body, setBodyState] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(formatISODate(card.dueDate));
  const [themeTag, setThemeTag] = useState(card.themeTag ?? "");
  const [blocked, setBlocked] = useState(card.blocked);
  const [blockerNote, setBlockerNote] = useState(card.blockerNote ?? "");
  const [saveState, setSaveState] = useState<SaveState>("saved");

  // The debounced save fires after the render that scheduled it, so it reads
  // the fields from here rather than from a stale closure.
  const latest = useRef({ title, body, dueDate, themeTag, blocked, blockerNote });
  latest.current = { title, body, dueDate, themeTag, blocked, blockerNote };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const f = latest.current;
    setSaveState("saving");
    try {
      await updateCard({
        id: card.id,
        title: f.title.trim() || card.title,
        description: f.body.trim() || null,
        dueDate: f.dueDate || null,
        themeTag: f.themeTag.trim() || null,
        blocked: f.blocked,
        blockerNote: f.blocked ? f.blockerNote.trim() || null : null,
      });
      // A keystroke that landed while this was in flight has its own timer.
      setSaveState(timer.current ? "unsaved" : "saved");
    } catch {
      setSaveState("error");
    }
  }

  function setBody(next: string) {
    setBodyState(next);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }

  /** A checkbox saves the moment it's clicked, so it can't wait for the
   *  render that would refresh `latest`. */
  function setBlockedAndSave(next: boolean) {
    setBlocked(next);
    latest.current = { ...latest.current, blocked: next };
    void save();
  }

  // Flush on the way out. `save` is recreated each render, so hold the newest.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(
    () => () => {
      if (timer.current) void saveRef.current();
    },
    [],
  );

  // A tab closed inside the debounce window would lose the last few words.
  useEffect(() => {
    if (saveState !== "unsaved" && saveState !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  return {
    title,
    setTitle,
    body,
    setBody,
    dueDate,
    setDueDate,
    themeTag,
    setThemeTag,
    blocked,
    setBlockedAndSave,
    blockerNote,
    setBlockerNote,
    saveState,
    save,
  };
}

export type CardDraft = ReturnType<typeof useCardDraft>;

export function saveStateLabel(state: SaveState): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "unsaved":
      return "Unsaved changes";
    case "error":
      return "Couldn't save — try again";
    default:
      return "Saved";
  }
}
