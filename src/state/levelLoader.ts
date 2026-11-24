/**
 * Level availability for the game flow. Precomputed levels (1–300) decode in well under a
 * millisecond; runtime levels (> 300) are generated with the chunked task in idle-time slices so
 * the next level is ready before the player taps Next (spec §7.4, §9).
 */
import { createLevelTask, getLevel, peekLevel } from '@/game/generator';
import { runTaskChunked } from '@/game/task';
import type { Level } from '@/game/types';

/** Slice budget for background generation (well under a frame). */
export const PREPARE_SLICE_MS = 6;
/** An idle callback fires within this time even when the JS thread never goes idle. */
const IDLE_TIMEOUT_MS = 50;

const inflight = new Map<number, Promise<Level>>();

/** Resolves on the next idle period (or a macrotask where idle callbacks do not exist). */
export const nextIdle = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(resolve, 0);
    }
  });

/** The level if it is ready without generating, else null. */
export const readyLevel = (level: number): Level | null => peekLevel(level);

/**
 * Makes `level` ready in the background: decodes a precomputed level at the next idle moment, or
 * generates a runtime one in ≤ 6 ms idle slices. Concurrent calls share one task.
 */
export const prepareLevel = (level: number): Promise<Level> => {
  const existing = inflight.get(level);
  if (existing !== undefined) return existing;
  const promise = nextIdle()
    .then(() =>
      runTaskChunked(createLevelTask(level), {
        sliceMs: PREPARE_SLICE_MS,
        now: () => performance.now(),
        yieldFn: nextIdle,
      }),
    )
    .then((generated) => generated ?? getLevel(level))
    .finally(() => {
      inflight.delete(level);
    });
  inflight.set(level, promise);
  return promise;
};

/** The level now: ready levels return at once; otherwise it is generated synchronously. */
export const levelNow = (level: number): Level => readyLevel(level) ?? getLevel(level);
