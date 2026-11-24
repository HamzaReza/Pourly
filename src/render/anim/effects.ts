/**
 * Pure models for the short effects: invalid-move shake, cap sparkles, win glow and confetti,
 * background bubbles, hint pulse, and the quality/motion switches that size them. Particle
 * parameters are generated once (seeded) on the JS thread; the per-frame functions are worklets
 * that write into preallocated transforms, so nothing is allocated per frame.
 */
import { createRng } from '@/game/rng';
import { PALETTE_SIZE } from '@/config/game';

import {
  CONFETTI_MS,
  durationScale,
  easeOutCubic,
  hash01,
  progress,
  scaled,
  SHAKE_AMPLITUDE,
  WIN_CONFETTI_DELAY_MS,
  WIN_GLOW_FALL_MS,
  WIN_GLOW_RISE_MS,
  WIN_GLOW_STAGGER_MS,
} from './timing';

/** Particle caps (spec §8.5.5); halved in low quality. */
export const MAX_CONFETTI = 60;
export const MAX_SPARKLES = 12;
/** Sparkles per completed tube at high quality (spec: 8–12). */
export const SPARKLES_PER_TUBE = 10;
export const MAX_BUBBLES = 12;

export type Quality = 'high' | 'low';

export interface EffectPrefs {
  readonly quality: Quality;
  readonly reducedMotion: boolean;
  /** Multiplies every duration. */
  readonly durationScale: number;
  /** Blur on glows (selection, hint, win). */
  readonly glowBlur: boolean;
  /** Selection glow ring (off in low quality, P3.13). */
  readonly selectionGlow: boolean;
  readonly bubbles: number;
  readonly confetti: number;
  readonly sparkles: number;
}

/** Low quality: no bubbles, no glow blur, half the particles. Reduced motion: ×0.4, no bubbles or confetti. */
export const effectPrefs = (quality: Quality, reducedMotion: boolean): EffectPrefs => {
  const low = quality === 'low';
  return {
    quality,
    reducedMotion,
    durationScale: durationScale(reducedMotion),
    glowBlur: !low,
    selectionGlow: !low,
    bubbles: low || reducedMotion ? 0 : MAX_BUBBLES,
    confetti: reducedMotion ? 0 : low ? MAX_CONFETTI / 2 : MAX_CONFETTI,
    sparkles: low ? SPARKLES_PER_TUBE / 2 : SPARKLES_PER_TUBE,
  };
};

/** Invalid-move shake offset for progress `t` (0..1): two full ±amplitude swings ending at 0. */
export const shakeOffset = (t: number): number => {
  'worklet';
  if (t <= 0 || t >= 1) return 0;
  return SHAKE_AMPLITUDE * Math.sin(Math.PI * 4 * t);
};

/** Anything an RSXform-like buffer entry exposes (`SkRSXform` in the app). */
export interface RSXformTarget {
  set(scos: number, ssin: number, tx: number, ty: number): void;
}

/**
 * Writes a transform that draws a sprite of size (w, h) centred at (cx, cy), uniformly scaled and
 * rotated about its centre. A scale of 0 hides the sprite.
 */
export const placeSprite = (
  target: RSXformTarget,
  scale: number,
  angle: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void => {
  'worklet';
  const scos = scale * Math.cos(angle);
  const ssin = scale * Math.sin(angle);
  const ax = w / 2;
  const ay = h / 2;
  target.set(scos, ssin, cx - scos * ax + ssin * ay, cy - ssin * ax - scos * ay);
};

export const hideSprite = (target: RSXformTarget): void => {
  'worklet';
  target.set(0, 0, -1000, -1000);
};

/** Sparkle `index` of `count` at progress `t` (0..1) around (cx, cy): position, size, spin. */
export const sparkleState = (
  index: number,
  count: number,
  t: number,
): { dx: number; dy: number; size: number; angle: number } => {
  'worklet';
  const jitter = hash01(index + 1);
  const direction = (Math.PI * 2 * index) / Math.max(1, count) + jitter * 0.5;
  const distance = (26 + 30 * hash01(index + 31)) * easeOutCubic(t);
  const grow = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  return {
    dx: Math.cos(direction) * distance,
    dy: Math.sin(direction) * distance - 12 * t,
    size: (0.9 + 0.6 * jitter) * Math.max(0, grow),
    angle: t * Math.PI * (1 + jitter),
  };
};

export interface ConfettiParticle {
  /** Start x as a share of the canvas width. */
  readonly x: number;
  /** Start y in dp (negative: above the canvas). */
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly rotation: number;
  readonly sway: number;
  readonly swayRate: number;
  readonly phase: number;
  readonly delay: number;
  readonly scale: number;
  /** Palette id; selects the sprite. */
  readonly color: number;
}

/** Gravity for confetti, dp/s². */
export const CONFETTI_GRAVITY = 520;

export const createConfetti = (count: number, seed = 0xc0f3771): readonly ConfettiParticle[] => {
  const rng = createRng(seed);
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < Math.min(count, MAX_CONFETTI); i += 1) {
    particles.push({
      x: rng.next(),
      y: -20 - rng.next() * 140,
      vx: (rng.next() - 0.5) * 90,
      vy: 120 + rng.next() * 160,
      spin: (rng.next() - 0.5) * 14,
      rotation: rng.next() * Math.PI * 2,
      sway: 6 + rng.next() * 16,
      swayRate: 3 + rng.next() * 4,
      phase: rng.next() * Math.PI * 2,
      delay: rng.next() * 260,
      scale: 0.75 + rng.next() * 0.5,
      color: rng.int(PALETTE_SIZE),
    });
  }
  return particles;
};

/** Confetti centre and angle at `ms` after the confetti started; null before its delay. */
export const confettiState = (
  particle: ConfettiParticle,
  ms: number,
  width: number,
): { x: number; y: number; angle: number } | null => {
  'worklet';
  const t = (ms - particle.delay) / 1000;
  if (t < 0) return null;
  return {
    x:
      particle.x * width +
      particle.vx * t +
      particle.sway * Math.sin(particle.swayRate * t + particle.phase),
    y: particle.y + particle.vy * t + 0.5 * CONFETTI_GRAVITY * t * t,
    angle: particle.rotation + particle.spin * t,
  };
};

export interface Bubble {
  readonly x: number;
  readonly size: number;
  /** Rise speed, dp/s. */
  readonly speed: number;
  readonly wobble: number;
  readonly wobbleRate: number;
  /** Start offset along the loop, dp. */
  readonly offset: number;
}

export const createBubbles = (count: number, seed = 0xb0bb1e5): readonly Bubble[] => {
  const rng = createRng(seed);
  const bubbles: Bubble[] = [];
  for (let i = 0; i < Math.min(count, MAX_BUBBLES); i += 1) {
    bubbles.push({
      x: (i + 0.2 + rng.next() * 0.6) / Math.max(1, count),
      size: 0.25 + rng.next() * 0.45,
      speed: 10 + rng.next() * 18,
      wobble: 4 + rng.next() * 10,
      wobbleRate: 0.3 + rng.next() * 0.5,
      offset: rng.next() * 2000,
    });
  }
  return bubbles;
};

/** Bubble centre at `seconds`, rising from below the canvas and wrapping above the top. */
export const bubbleState = (
  bubble: Bubble,
  seconds: number,
  width: number,
  height: number,
  spriteSize: number,
): { x: number; y: number } => {
  'worklet';
  const span = height + spriteSize * 2;
  const travelled = (bubble.offset + bubble.speed * seconds) % span;
  return {
    x: bubble.x * width + bubble.wobble * Math.sin(bubble.wobbleRate * seconds * Math.PI * 2),
    y: height + spriteSize - travelled,
  };
};

export interface WinTimeline {
  /** Glow start of tube `i` is `i × stagger`. */
  readonly stagger: number;
  readonly rise: number;
  readonly fall: number;
  readonly glowEnd: number;
  /** -1 when there is no confetti. */
  readonly confettiStart: number;
  readonly confettiEnd: number;
  readonly total: number;
}

export const winTimeline = (tubeCount: number, confetti: number, scale: number): WinTimeline => {
  const stagger = scaled(WIN_GLOW_STAGGER_MS, scale);
  const rise = scaled(WIN_GLOW_RISE_MS, scale);
  const fall = scaled(WIN_GLOW_FALL_MS, scale);
  const lastStart = Math.max(0, tubeCount - 1) * stagger;
  const glowEnd = lastStart + rise + fall;
  const confettiStart = confetti > 0 ? lastStart + scaled(WIN_CONFETTI_DELAY_MS, scale) : -1;
  const confettiEnd = confetti > 0 ? confettiStart + scaled(CONFETTI_MS, scale) : -1;
  return {
    stagger,
    rise,
    fall,
    glowEnd,
    confettiStart,
    confettiEnd,
    total: Math.max(glowEnd, confettiEnd),
  };
};

/** Glow strength (0..1) of tube `index` at `ms` into the win sequence. */
export const winGlowAlpha = (timeline: WinTimeline, index: number, ms: number): number => {
  'worklet';
  const start = index * timeline.stagger;
  if (ms < start) return 0;
  const rise = timeline.rise;
  if (ms < start + rise) return progress(ms, start, start + rise);
  return 1 - progress(ms, start + rise, start + rise + timeline.fall);
};

/** Hint pulse strength for a 0..1 ping-pong clock. */
export const hintAlpha = (pulse: number): number => {
  'worklet';
  return 0.35 + 0.65 * pulse;
};
