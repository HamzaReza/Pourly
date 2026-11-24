import type { StateStorage } from 'zustand/middleware';

import { logger } from '@/utils/logger';

export interface DebouncedStorage extends StateStorage {
  /** Writes every pending value now (call when the app goes to the background). */
  flush: () => Promise<void>;
}

/**
 * Wraps a string storage so writes are coalesced: each `setItem` replaces the pending value and
 * restarts a `delayMs` timer; only the latest value is written. Reads see pending values first,
 * so the store and storage never disagree.
 */
export const createDebouncedStorage = (base: StateStorage, delayMs: number): DebouncedStorage => {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const flush = async (): Promise<void> => {
    cancelTimer();
    const entries = [...pending.entries()];
    pending.clear();
    await Promise.all(
      entries.map(async ([name, value]) => {
        try {
          await base.setItem(name, value);
        } catch (error: unknown) {
          logger.warn('Deferred storage write failed', name, error);
        }
      }),
    );
  };

  return {
    getItem: (name) => pending.get(name) ?? base.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    },
    removeItem: (name) => {
      pending.delete(name);
      return base.removeItem(name);
    },
    flush,
  };
};
