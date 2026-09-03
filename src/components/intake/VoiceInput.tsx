"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useVoiceRecorder, voiceInputSupported } from "./useVoiceRecorder";
import { VoiceThreads } from "./VoiceThreads";

/**
 * Voice → text in the composer.
 *
 * `useVoiceInput` owns the state machine: idle → recording → transcribing →
 * back to idle with the transcript handed to `onTranscript`. The parent puts
 * `MicButton` in its action row and swaps its textarea for `VoicePanel` while
 * `active` is true, so the two pieces share one state without a context.
 *
 * The recording never touches the database. It goes to /api/transcribe, comes
 * back as text, and lands in the box for the person to read, edit and send.
 */
export type VoiceStatus = "idle" | "requesting" | "recording" | "transcribing";

export function useVoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const rec = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  // Feature-detected after mount so the server render and the first client
  // render agree — `MediaRecorder` does not exist on the server.
  useEffect(() => setSupported(voiceInputSupported()), []);

  const status: VoiceStatus = transcribing
    ? "transcribing"
    : rec.status === "recording" || rec.status === "stopping"
      ? "recording"
      : rec.status === "requesting"
        ? "requesting"
        : "idle";

  const start = useCallback(() => {
    setError(null);
    void rec.start();
  }, [rec]);

  const cancel = useCallback(() => {
    void rec.stop({ discard: true });
  }, [rec]);

  const finish = useCallback(async () => {
    const blob = await rec.stop();
    if (!blob || blob.size === 0) {
      setError("Nothing was recorded.");
      return;
    }
    setTranscribing(true);
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `Transcription failed (${res.status}).`);
        return;
      }
      const text = (data.text ?? "").trim();
      if (!text) {
        setError("Didn't catch anything. Try again a little closer to the mic.");
        return;
      }
      onTranscript(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }, [onTranscript, rec]);

  return {
    supported,
    status,
    active: status !== "idle",
    analyser: rec.analyser,
    startedAt: rec.startedAt,
    error: error ?? rec.error,
    clearError: () => {
      setError(null);
      rec.clearError();
    },
    start,
    finish,
    cancel,
  };
}

export type VoiceInput = ReturnType<typeof useVoiceInput>;

export function MicButton({ voice, disabled }: { voice: VoiceInput; disabled?: boolean }) {
  if (!voice.supported) return null;
  const busy = voice.active;
  return (
    <button
      type="button"
      onClick={voice.start}
      disabled={disabled || busy}
      aria-label="Dictate"
      title="Dictate (speak, then press stop)"
      className={cn(
        // Solid and larger than the other actions on purpose: dictation is the
        // primary way notes get in on a phone, and a ghost icon sitting among
        // other ghost icons is not something you find one-handed. 44px is the
        // touch target Apple asks for, and it is filled so it reads as the
        // affordance rather than as decoration.
        "pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
        "bg-foreground text-background shadow-sm transition-[opacity,transform]",
        "sm:h-9 sm:w-9",
        (disabled || busy) && "opacity-40",
      )}
    >
      <Mic className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={2} />
    </button>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoicePanel({ voice }: { voice: VoiceInput }) {
  const [now, setNow] = useState(() => Date.now());
  const recording = voice.status === "recording";
  const transcribing = voice.status === "transcribing";

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [recording]);

  // Escape throws the take away; Enter keeps it. Same keys as any dialog.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        voice.cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void voice.finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, voice]);

  return (
    <div className="overflow-hidden rounded-md bg-card shadow-xs ring-1 ring-inset ring-input">
      <div className="px-3 pt-2">
        <VoiceThreads
          analyser={voice.analyser}
          mode={transcribing ? "transcribing" : "recording"}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-hairline bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              recording ? "animate-pulse bg-red-500" : "bg-muted-foreground/50",
            )}
          />
          {transcribing
            ? "Transcribing…"
            : recording && voice.startedAt
              ? `Listening · ${formatElapsed(now - voice.startedAt)}`
              : "Starting microphone…"}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {recording && (
            <button
              type="button"
              onClick={voice.cancel}
              aria-label="Discard recording"
              title="Discard (Esc)"
              className="pressable flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void voice.finish()}
            disabled={!recording}
            aria-label="Stop and transcribe"
            title="Stop and transcribe (Enter)"
            className={cn(
              "pressable flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background transition-opacity",
              !recording && "opacity-40",
            )}
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        </span>
      </div>
    </div>
  );
}
