/**
 * Frame-time monitoring (spec §8.5.6, §8.5.9). The window math is pure and worklet-safe (unit
 * tested); the hooks sample UI-thread frame intervals with Reanimated's `useFrameCallback`.
 */
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Average frame time above which `auto` quality drops to low. */
export const SLOW_FRAME_MS = 20;
/** Averaging window. */
export const QUALITY_WINDOW_MS = 3000;
/** Frames measured right after the monitor starts are ignored (screen transition, first draws). */
export const WARMUP_MS = 1000;
/** Longer gaps are pauses (app backgrounded, debugger), not slow frames, and are skipped. */
export const MAX_FRAME_SAMPLE_MS = 250;

/** Mutable accumulator; one instance lives on the UI thread, so sampling allocates nothing. */
export interface FrameWindow {
  /** Time since the monitor started, including skipped gaps. */
  age: number;
  sum: number;
  count: number;
}

export type FrameVerdict = 'pending' | 'ok' | 'slow';

export const createFrameWindow = (): FrameWindow => ({ age: 0, sum: 0, count: 0 });

/**
 * Adds one frame interval. Returns `pending` until the window spans `QUALITY_WINDOW_MS`, then
 * `slow` or `ok` for that window and starts the next one.
 */
export const sampleFrame = (frames: FrameWindow, frameMs: number): FrameVerdict => {
  'worklet';
  if (!(frameMs > 0)) return 'pending';
  frames.age += frameMs;
  if (frames.age <= WARMUP_MS || frameMs > MAX_FRAME_SAMPLE_MS) return 'pending';
  frames.sum += frameMs;
  frames.count += 1;
  if (frames.sum < QUALITY_WINDOW_MS) return 'pending';
  const average = frames.sum / frames.count;
  frames.sum = 0;
  frames.count = 0;
  return average > SLOW_FRAME_MS ? 'slow' : 'ok';
};

/**
 * While `enabled` (quality is `auto` and not yet downgraded), measures UI frame times and calls
 * `onSlow` once on the JS thread when a 3 s window averages more than 20 ms per frame.
 */
export const useAdaptiveQualityMonitor = (enabled: boolean, onSlow: () => void): void => {
  const frames = useSharedValue<FrameWindow>(createFrameWindow());
  const reported = useSharedValue(false);
  const callback = useFrameCallback((frame) => {
    'worklet';
    if (reported.get()) return;
    // The accumulator object lives on the UI runtime and is updated in place: no per-frame garbage.
    const verdict = sampleFrame(frames.get(), frame.timeSincePreviousFrame ?? 0);
    if (verdict === 'slow') {
      reported.set(true);
      scheduleOnRN(onSlow);
    }
  }, false);

  useEffect(() => {
    frames.set(createFrameWindow());
    reported.set(false);
    callback.setActive(enabled);
    return () => callback.setActive(false);
  }, [enabled, callback, frames, reported]);
};

/** Frames per second (exponential moving average) for the dev overlay. */
export const useFrameRate = (active: boolean): SharedValue<number> => {
  const fps = useSharedValue(0);
  const callback = useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame;
    if (dt === null || dt <= 0 || dt > MAX_FRAME_SAMPLE_MS) return;
    const current = 1000 / dt;
    const previous = fps.get();
    fps.set(previous === 0 ? current : previous * 0.9 + current * 0.1);
  }, false);

  useEffect(() => {
    callback.setActive(active);
    return () => callback.setActive(false);
  }, [active, callback]);

  return fps;
};
