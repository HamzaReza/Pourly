import { logger } from '@/utils/logger';

import { useGameStore } from './gameStore';
import { useProgressStore } from './progressStore';
import { useSettingsStore } from './settingsStore';

interface PersistApi {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
}

const waitFor = (api: PersistApi): Promise<void> =>
  new Promise((resolve) => {
    if (api.hasHydrated()) {
      resolve();
      return;
    }
    const unsubscribe = api.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });

/** Upper bound on the hydration wait, so a storage failure can never keep the splash up. */
export const HYDRATION_TIMEOUT_MS = 3000;

/**
 * Resolves once every persisted store has loaded from AsyncStorage, or after the timeout
 * (stores then keep their defaults and the app stays playable).
 */
export const waitForStoresHydrated = async (
  timeoutMs: number = HYDRATION_TIMEOUT_MS,
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const result = await Promise.race([
    Promise.all([
      waitFor(useSettingsStore.persist),
      waitFor(useProgressStore.persist),
      waitFor(useGameStore.persist),
    ]),
    timeout,
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (result === 'timeout') logger.warn('Store hydration timed out; continuing with defaults');
};
