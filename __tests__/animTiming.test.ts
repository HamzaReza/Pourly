import {
  clamp01,
  durationScale,
  easeInOutCubic,
  easeInOutSine,
  easeOutCubic,
  hash01,
  lerp,
  pourDurationMs,
  progress,
  REDUCED_MOTION_SCALE,
  scaled,
} from '@/render/anim/timing';

describe('animation timing helpers', () => {
  it('times a pour as 550 ms + 200 ms per segment moved', () => {
    expect(pourDurationMs(0)).toBe(550);
    expect(pourDurationMs(1)).toBe(750);
    expect(pourDurationMs(4)).toBe(1350);
    expect(pourDurationMs(-2)).toBe(550);
  });

  it('scales durations by 0.4 with reduced motion and rounds to whole ms', () => {
    expect(REDUCED_MOTION_SCALE).toBe(0.4);
    expect(durationScale(true)).toBe(0.4);
    expect(durationScale(false)).toBe(1);
    expect(scaled(370, durationScale(true))).toBe(148);
    expect(scaled(221, 0.4)).toBe(88);
    expect(scaled(370, 1)).toBe(370);
  });

  it('clamps progress to its window, including a zero-length window', () => {
    expect(progress(5, 0, 10)).toBe(0.5);
    expect(progress(-1, 0, 10)).toBe(0);
    expect(progress(20, 0, 10)).toBe(1);
    expect(progress(5, 10, 10)).toBe(0);
    expect(progress(10, 10, 10)).toBe(1);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(lerp(2, 6, 0.25)).toBe(3);
  });

  it('eases from 0 to 1 through the midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('hashes integers to stable values in [0, 1)', () => {
    for (let key = 0; key < 200; key += 1) {
      const value = hash01(key);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hash01(key)).toBe(value);
    }
  });

  it('eases tube travel gently: symmetric, 0 → 1, and never faster than 1.6× the average', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0, 9);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutSine(1)).toBeCloseTo(1, 9);
    expect(easeInOutSine(0.25) + easeInOutSine(0.75)).toBeCloseTo(1, 9);
    const step = 0.001;
    let peak = 0;
    for (let t = 0; t + step <= 1; t += step) {
      peak = Math.max(peak, (easeInOutSine(t + step) - easeInOutSine(t)) / step);
    }
    expect(peak).toBeLessThan(1.6);
  });
});
