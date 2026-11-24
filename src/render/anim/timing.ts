/**
 * Animation durations and small math helpers shared by the UI-thread animations and the headless
 * frame renderer. Pure: no platform imports. Every helper is a worklet.
 */

/** Reduced motion multiplies every duration by this (spec §8.5.11). */
export const REDUCED_MOTION_SCALE = 0.4;

/** Pour: `280 ms + 90 ms × segmentsMoved` (spec §8.3). */
export const POUR_BASE_MS = 280;
export const POUR_SEGMENT_MS = 90;
/** The source tube's return to its slot. */
export const POUR_RETURN_MS = 220;
/** Travel from the source slot to the pour position (inside the base duration). */
export const POUR_TRAVEL_MS = 180;
/** The stream starts once the tube has arrived and tilted to the lip. */
export const POUR_STREAM_START_MS = 220;
/** The stream detaches from the lip this long before the pour ends. */
export const POUR_STREAM_END_LEAD_MS = 20;
/** Head of the stream travelling down / tail falling in. */
export const STREAM_HEAD_MS = 60;
export const STREAM_TAIL_MS = 60;

/** Mystery reveal flip (scaleX 1 → 0 → 1). */
export const FLIP_MS = 260;
/** Cap drop, then the squash-and-stretch settle, then sparkles. */
export const CAP_DROP_MS = 170;
export const CAP_SETTLE_MS = 300;
export const SPARKLE_MS = 560;

/** Invalid move shake: ±4 dp over 120 ms. */
export const SHAKE_MS = 120;
export const SHAKE_AMPLITUDE = 4;

/** Level win: per-tube glow stagger, glow length, confetti fall time. */
export const WIN_GLOW_STAGGER_MS = 70;
export const WIN_GLOW_RISE_MS = 180;
export const WIN_GLOW_FALL_MS = 320;
export const WIN_CONFETTI_DELAY_MS = 200;
export const CONFETTI_MS = 1900;

/** Hint pulse half-period. */
export const HINT_PULSE_MS = 700;

export const durationScale = (reducedMotion: boolean): number => {
  'worklet';
  return reducedMotion ? REDUCED_MOTION_SCALE : 1;
};

/** A duration in ms after the reduced-motion scale, rounded to whole ms. */
export const scaled = (ms: number, scale: number): number => {
  'worklet';
  return Math.round(ms * scale);
};

/** Unscaled pour duration (before the return). */
export const pourDurationMs = (segmentsMoved: number): number => {
  'worklet';
  return POUR_BASE_MS + POUR_SEGMENT_MS * Math.max(0, segmentsMoved);
};

export const clamp01 = (value: number): number => {
  'worklet';
  return Math.min(1, Math.max(0, value));
};

export const lerp = (from: number, to: number, t: number): number => {
  'worklet';
  return from + (to - from) * t;
};

/** Progress of `ms` through the window [start, end], clamped to 0..1. */
export const progress = (ms: number, start: number, end: number): number => {
  'worklet';
  if (end <= start) return ms >= end ? 1 : 0;
  return clamp01((ms - start) / (end - start));
};

export const easeInOutCubic = (t: number): number => {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const easeOutCubic = (t: number): number => {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
};

export const easeInQuad = (t: number): number => {
  'worklet';
  return t * t;
};

/** Deterministic pseudo-random value in [0, 1) for an integer key (no state, worklet-safe). */
export const hash01 = (key: number): number => {
  'worklet';
  const x = Math.sin(key * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
