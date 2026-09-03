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
 * Motion blur is done the old way, in two parts. The canvas is never cleared
 * outright — each frame erases a fraction of the last one, so a thread leaves
 * a fading trail behind where it just was. Under the crisp strokes sits a
 * blurred, wider copy at low alpha, which reads as glow. Both are cheap on a
 * strip this size and need no WebGL.
 *
 * While transcribing there is no analyser; the threads settle to a slow
 * breathing and the gradient keeps travelling, which is the progress signal.
 *
 * Reduced motion: no idle drift, a still gradient and no trails. The threads
 * still move with the voice, because that is feedback, not decoration.
 */
export type ThreadsMode = "recording" | "transcribing";

interface Thread {
  /** Fraction of the useful spectrum this thread listens to. */
  band: [number, number];
  /** Waves across the width. */
  freq: number;
  /** How fast the wave drifts sideways, relative to SPEED. */
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

// Tuning. These are the knobs that were turned after the first real test:
// "moves a bit too fast, and a bit too much up and down".
/** Global multiplier on every drift rate. 1 was the original; 0.5 is calm. */
const SPEED = 0.5;
/** Peak displacement as a fraction of the strip height. Was 0.42. */
const MAX_AMP = 0.26;
/** How hard a voice lifts the threads. Was 3. */
const GAIN = 2.2;
/** Fraction of the previous frame erased each frame. Lower = longer trails. */
const TRAIL_FADE = 0.32;
/** Glow layer: blur radius and how much wider than the crisp stroke it is. */
const GLOW_BLUR_PX = 5;
const GLOW_WIDTH = 3.2;
const GLOW_ALPHA = 0.38;

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
    const supportsFilter = "filter" in ctx;
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
          const target = Math.min(1, mean * mean * GAIN);
          // Fast attack, slow release: a syllable lifts the thread at once
          // and it eases back down rather than dropping.
          const k = target > levels[i] ? 0.4 : 0.07;
          levels[i] += (target - levels[i]) * k;
        });
      } else {
        // No voice to listen to: settle toward a gentle breathing.
        for (let i = 0; i < levels.length; i++) levels[i] += (0.06 - levels[i]) * 0.06;
      }
    };

    /** Trace one thread's path at time t. Shared by the glow and crisp passes
     *  so the two are always the same curve. */
    const trace = (th: Thread, t: number, amp: number) => {
      const mid = height / 2;
      const drift1 = reduceMotion ? 0 : t * th.speed * SPEED;
      const drift2 = reduceMotion ? 0 : t * th.speed * SPEED * 1.7;
      ctx.beginPath();
      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS;
        const x = u * width;
        // Both ends pinned: the envelope is zero at the edges and full in
        // the middle, so the threads read as strung between two points.
        const env = Math.pow(Math.sin(Math.PI * u), 1.25);
        const wave =
          Math.sin(2 * Math.PI * th.freq * u + th.phase + drift1) +
          0.25 * Math.sin(2 * Math.PI * th.freq * 2.3 * u - drift2 + th.phase);
        const y = mid + env * amp * wave;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      readLevels();

      // Motion blur, part one: fade what is already there instead of wiping
      // it. destination-out with a translucent fill erases a fraction of the
      // alpha everywhere, so the background stays transparent and the last
      // few frames linger as a trail.
      if (reduceMotion) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = `rgba(0,0,0,${TRAIL_FADE})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }

      const drift = reduceMotion ? 0 : (t * width * 0.12) % width;
      const gradient = ctx.createLinearGradient(-width + drift, 0, width + drift, 0);
      gradient.addColorStop(0, COLORS[0]);
      gradient.addColorStop(0.25, COLORS[1]);
      gradient.addColorStop(0.5, COLORS[2]);
      gradient.addColorStop(0.75, COLORS[1]);
      gradient.addColorStop(1, COLORS[0]);
      ctx.strokeStyle = gradient;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const maxAmp = height * MAX_AMP;
      const breathing =
        modeRef.current === "transcribing" && !reduceMotion ? 0.5 + 0.5 * Math.sin(t * 1.2) : 1;
      const amps = THREADS.map((_, i) => (height * 0.02 + levels[i] * maxAmp) * breathing);

      // Motion blur, part two: a blurred, wider, dimmer copy underneath.
      if (supportsFilter) {
        ctx.filter = `blur(${GLOW_BLUR_PX}px)`;
        THREADS.forEach((th, i) => {
          ctx.globalAlpha = th.alpha * GLOW_ALPHA;
          ctx.lineWidth = th.width * GLOW_WIDTH;
          trace(th, t, amps[i]);
          ctx.stroke();
        });
        ctx.filter = "none";
      }

      // The crisp threads on top.
      THREADS.forEach((th, i) => {
        ctx.globalAlpha = th.alpha;
        ctx.lineWidth = th.width;
        trace(th, t, amps[i]);
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
