"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone capture for the composer.
 *
 * Owns the MediaStream, the MediaRecorder and an AnalyserNode tapped off the
 * same stream. The analyser is what drives the thread animation — it is never
 * wired to the speakers, so the mic is not played back. Everything is torn
 * down on stop, cancel or unmount so the browser's "recording" indicator goes
 * away the moment the person is done.
 */
export type RecorderStatus = "idle" | "requesting" | "recording" | "stopping";

export function voiceInputSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

// Chrome and Firefox give us opus in webm; Safari only knows mp4. Whichever
// the browser picks, the server maps the container to a file extension the
// transcription API accepts.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Five minutes is well under the 25MB upload cap at opus bitrates, and longer
 *  than anything that belongs in a composer box. */
const DEFAULT_MAX_MS = 5 * 60_000;

function describeMicError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it in the browser's site settings and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found.";
  }
  if (name === "NotReadableError") {
    return "The microphone is in use by another app.";
  }
  return err instanceof Error ? err.message : "Couldn't start recording.";
}

export function useVoiceRecorder({ maxMs = DEFAULT_MAX_MS }: { maxMs?: number } = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    recorderRef.current = null;
    setAnalyser(null);
    setStartedAt(null);
  }, []);

  /** Stop and hand back the recording. `discard: true` stops and returns null. */
  const stop = useCallback(
    (opts?: { discard?: boolean }) =>
      new Promise<Blob | null>((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") {
          teardown();
          setStatus("idle");
          resolve(null);
          return;
        }
        resolveRef.current = opts?.discard ? () => resolve(null) : resolve;
        setStatus("stopping");
        rec.stop();
      }),
    [teardown],
  );

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(stream).connect(node);

      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null;
        chunksRef.current = [];
        const resolve = resolveRef.current;
        resolveRef.current = null;
        teardown();
        setStatus("idle");
        resolve?.(blob);
      };
      rec.start(250);
      recorderRef.current = rec;
      setAnalyser(node);
      setStartedAt(Date.now());
      setStatus("recording");

      timerRef.current = window.setTimeout(() => {
        void stop();
      }, maxMs);
    } catch (err) {
      teardown();
      setStatus("idle");
      setError(describeMicError(err));
    }
  }, [maxMs, stop, teardown]);

  // Leaving the page mid-recording must release the mic.
  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      teardown();
    },
    [teardown],
  );

  return { status, error, analyser, startedAt, start, stop, clearError: () => setError(null) };
}
