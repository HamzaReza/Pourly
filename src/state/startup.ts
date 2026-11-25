/**
 * Launch routing, decided once per app start after the stores hydrate.
 * - First launch (spec §1, §9): a brand-new player (level 1, no saved game) goes straight into
 *   the game with no extra screens.
 * - A notification tap that launched the app (spec §14) wins over that: Home opens the screen the
 *   notification points to (Daily for daily, streak and gift reminders; Home itself for comebacks).
 */
import type { NotificationRoute } from '@/services/notificationPlanner';

import { useGameStore } from './gameStore';
import { useProgressStore } from './progressStore';

let autoStart = false;
let launchRoute: NotificationRoute | null = null;

/**
 * Decides whether Home should hand over to the game immediately, or to the screen of the
 * notification that launched the app. Call after hydration.
 */
export const decideAutoStart = (notificationRoute: NotificationRoute | null = null): void => {
  const { session, parked } = useGameStore.getState();
  launchRoute = notificationRoute;
  autoStart =
    notificationRoute === null &&
    useProgressStore.getState().level === 1 &&
    session === null &&
    parked === null;
};

/** The screen a launching notification asked for; returned once, then null. */
export const consumeLaunchRoute = (): NotificationRoute | null => {
  const route = launchRoute;
  launchRoute = null;
  return route;
};

/** True until consumed: Home redirects to the game once per app start. */
export const shouldAutoStart = (): boolean => autoStart;

export const consumeAutoStart = (): void => {
  autoStart = false;
};
