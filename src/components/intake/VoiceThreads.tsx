"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The listening indicator: four threads pinned at both edges, free in the
 * middle, painted with a gradient that drifts left to right.
 *
 * Each thread listens to a different slice of the spectrum — the lowest to the
 * voice's fundamental, the highest to sibilants — so speech moves them
 * differently rather than in lock-step. Levels are smoothed with a fast
 * attack and a slow release, which is what makes the motion read as a voice
 * rather than a VU meter.
 *
 * While transcribing there is no analyser; the threads settle to a slow
 * breathing and the gradient keeps travelling, which is the progress signal.
 *
 * Reduced motion: no idle drift and a still gradient. The threads still move
 * with the voice, because that is feedback, not decoration.
 */
export type ThreadsMode = "recording" | "transcribing";

interface Thread {
  /** Fraction of the useful spectrum this thread listens to. */
  band: [number, number];
  /** Waves across the width. */
  freq: number;
  /** How fast the wave drifts sideways. */
  speed: number;
  phase: number;
  alpha: number;
  width: number;
}

const THREADS: Thread[] = [
  { band: [0.0, 0.14], freq: 1.0, speed: 0.9, phase: 0.0, alpha: 0.95, width: 1.7 },
  { band: [0.1, 0.32], freq: 1.5, speed: 1.25, phase: 1.9, alpha: 0.8, width: 1.4 },
  { band: [0.28, 0.6], freq: 2.0, speed: 1.05, phase: 3.4, alpha: 0.65, width: 1.2 },
  { band: [0.55, 1.0], freq: 2.6, speed: 1.55, phase: 4.9, alpha: 0.5, width: 1.0 },
];

// Speech lives below ~4kHz. With fftSize 512 at 48kHz each bin is ~94Hz, so
// the first 44 bins are the ones worth listening to; the rest is hiss.
const USEFUL_BINS = 44;
const SEGMENTS = 96;

const COLORS = ["#6366f1", "#22d3ee", "#a855f7"] as const;

export function VoiceThreads({
  analyser,
  mode,
  className,
}: {
  analyser: AnalyserNode | null;
  mode: ThreadsMode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef(analyser);
  const modeRef = useRef(mode);
  analyserRef.current = analyser;
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const levels = new Float32Array(THREADS.length);
    let bins: Uint8Array<ArrayBuffer> | null = null;
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const t0 = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const readLevels = () => {
      const node = analyserRef.current;
      if (node && modeRef.current === "recording") {
        if (!bins || bins.length !== node.frequencyBinCount) {
          bins = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
        }
        node.getByteFrequencyData(bins);
        const span = Math.min(USEFUL_BINS, bins.length);
        THREADS.forEach((th, i) => {
          const from = Math.floor(th.band[0] * span);
          const to = Math.max(from + 1, Math.floor(th.band[1] * span));
          let sum = 0;
          for (let b = from; b < to; b++) sum += bins![b];
          // Square the mean so quiet room noise stays near the baseline and a
          // voice actually lifts the thread.
          const mean = sum / (to - from) / 255;
          const target = Math.min(1, mean * mean * 3);
          const k = target > levels[i] ? 0.5 : 0.1;
          levels[i] += (target - levels[i]) * k;
        });
      } else {
        // No voice to listen to: settle toward a gentle breathing.
        for (let i = 0; i < levels.length; i++) levels[i] += (0.06 - levels[i]) * 0.06;
      }
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      readLevels();
      ctx.clearRect(0, 0, width, height);

      const drift = reduceMotion ? 0 : (t * width * 0.28) % width;
      const gradient = ctx.createLinearGradient(-width + drift, 0, width + drift, 0);
      gradient.addColorStop(0, COLORS[0]);
      gradient.addColorStop(0.25, COLORS[1]);
      gradient.addColorStop(0.5, COLORS[2]);
      gradient.addColorStop(0.75, COLORS[1]);
      gradient.addColorStop(1, COLORS[0]);
      ctx.strokeStyle = gradient;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const mid = height / 2;
      const maxAmp = height * 0.42;
      const breathing = modeRef.current === "transcribing" && !reduceMotion ? 0.5 + 0.5 * Math.sin(t * 1.6) : 1;

      THREADS.forEach((th, i) => {
        const amp = (height * 0.025 + levels[i] * maxAmp) * breathing;
        const drift1 = reduceMotion ? 0 : t * th.speed;
        const drift2 = reduceMotion ? 0 : t * th.speed * 1.7;
        ctx.globalAlpha = th.alpha;
        ctx.lineWidth = th.width;
        ctx.beginPath();
        for (let s = 0; s <= SEGMENTS; s++) {
          const u = s / SEGMENTS;
          const x = u * width;
          // Both ends pinned: the envelope is zero at the edges and full in
          // the middle, so the threads read as strung between two points.
          const env = Math.pow(Math.sin(Math.PI * u), 1.25);
          const wave =
            Math.sin(2 * Math.PI * th.freq * u + th.phase + drift1) +
            0.35 * Math.sin(2 * Math.PI * th.freq * 2.3 * u - drift2 + th.phase);
          const y = mid + env * amp * wave;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={mode === "recording" ? "Listening" : "Transcribing"}
      className={cn("block h-16 w-full", className)}
    />
  );
}
