/**
 * Cooperative, time-sliced execution of long pure computations (solver, generator).
 *
 * The work is written as a generator function that `yield`s after each small unit of work (a few
 * dozen solver nodes). A `Task` runs units until its time budget would be exceeded, then returns
 * control to the caller. No timers live here: the clock and the yield function are injected, so
 * the same code runs synchronously in scripts and tests and in ≤ 8 ms slices in the app.
 */

/** A unit-of-work generator: every `yield` is a safe point to pause. */
export type Work<T> = Generator<void, T, void>;

export type TaskStep<T> = { readonly done: false } | { readonly done: true; readonly value: T };

export interface Task<T> {
  /**
   * Runs units of work for at most about `budgetMs` (measured with `now`). Stops early when the
   * next unit would likely overrun, based on the slowest unit seen so far. Always runs at least
   * one unit so progress is guaranteed.
   */
  step(budgetMs: number, now: () => number): TaskStep<T>;
}

/** Default slice length for gameplay (spec §7.1). */
export const DEFAULT_SLICE_MS = 8;

export const createTask = <T>(work: Work<T>): Task<T> => {
  let result: TaskStep<T> | null = null;
  let slowestUnit = 0;
  return {
    step(budgetMs, now) {
      if (result !== null) return result;
      const start = now();
      for (;;) {
        const unitStart = now();
        const next = work.next();
        const unitEnd = now();
        slowestUnit = Math.max(slowestUnit, unitEnd - unitStart);
        if (next.done === true) {
          result = { done: true, value: next.value };
          return result;
        }
        if (unitEnd - start + slowestUnit > budgetMs) return { done: false };
      }
    },
  };
};

/** Runs work to completion synchronously. */
export const runWork = <T>(work: Work<T>): T => {
  for (;;) {
    const next = work.next();
    if (next.done === true) return next.value;
  }
};

export interface ChunkOptions {
  /** Slice length in ms; defaults to `DEFAULT_SLICE_MS`. */
  readonly sliceMs?: number;
  /** Monotonic clock in ms, e.g. `performance.now`. */
  readonly now: () => number;
  /** Hands control back to the host between slices, e.g. a `requestIdleCallback` promise. */
  readonly yieldFn: () => Promise<void>;
  /** Called between slices; return true to stop early (the promise then resolves to null). */
  readonly isCancelled?: () => boolean;
}

/** Runs a task in slices, yielding to the host between them. Resolves null when cancelled. */
export const runTaskChunked = async <T>(
  task: Task<T>,
  options: ChunkOptions,
): Promise<T | null> => {
  const sliceMs = options.sliceMs ?? DEFAULT_SLICE_MS;
  for (;;) {
    if (options.isCancelled?.() === true) return null;
    const step = task.step(sliceMs, options.now);
    if (step.done) return step.value;
    await options.yieldFn();
  }
};
