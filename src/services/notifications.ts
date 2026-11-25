/**
 * Local notifications (spec §14), Android only.
 *
 * - The `reminders` channel (importance DEFAULT, localized name) is created before anything is
 *   scheduled and before the permission request (Android 13+ shows its runtime prompt only once a
 *   channel exists).
 * - Foreground notifications are suppressed: no banner, list entry or sound while playing.
 * - Rescheduling cancels every scheduled notification, then schedules the planner's output with
 *   typed DATE triggers on the `reminders` channel. Titles and bodies are translated at that
 *   moment in the player's chosen language (Settings language, else the device's). It runs on
 *   start, on every return to the foreground (after re-reading the OS permission, so a permission
 *   revoked in Android settings is noticed), and, debounced, whenever a planner input changes
 *   (daily completed, gift claimed, streak, level, permission, toggles) or the language changes.
 * - Taps: a notification carries its `pourly://` deep link in `data.url`. A tap while the app runs
 *   arrives through the response listener and navigates at once; the tap that cold-started the app
 *   is read during start-up (`readLaunchRoute`) and opened by Home after its first frame. Each
 *   response is handled once.
 *
 * `expo-notifications` is imported lazily (it warns in Expo Go and has no native module in Jest);
 * `setNotificationsModuleLoader` replaces the loader in tests.
 */
import type { NotificationRequestInput, NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { i18n, languageForPreference } from '@/i18n';
import type { ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { colors } from '@/ui/tokens';
import { logger } from '@/utils/logger';

import {
  planNotifications,
  routeForDeepLink,
  type NotificationRoute,
  type PlannedNotification,
} from './notificationPlanner';

type NotificationsModule = typeof import('expo-notifications');

export const REMINDERS_CHANNEL_ID = 'reminders';

/** Quiet period before a state change reschedules (bursts such as a win collapse into one run). */
export const RESCHEDULE_DEBOUNCE_MS = 1500;

/** What the OS reports about the notification permission. */
export interface NotificationPermission {
  readonly granted: boolean;
  /** False once Android will no longer show its prompt (denied twice, or blocked in settings). */
  readonly canAskAgain: boolean;
}

export type NotificationsModuleLoader = () => Promise<NotificationsModule>;

let importModule: NotificationsModuleLoader = () => import('expo-notifications');
let modulePromise: Promise<NotificationsModule | null> | null = null;

/** Replaces how `expo-notifications` is loaded (tests, where dynamic `import()` is unavailable). */
export const setNotificationsModuleLoader = (loader: NotificationsModuleLoader): void => {
  importModule = loader;
  modulePromise = null;
};

const loadModule = (): Promise<NotificationsModule | null> => {
  modulePromise ??= importModule().catch((error: unknown) => {
    logger.warn('Notifications are unavailable', error);
    return null;
  });
  return modulePromise;
};

const progress = () => useProgressStore.getState();

// ---------------------------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------------------------

type Listener = () => void;

let permission: NotificationPermission | null = null;
const listeners = new Set<Listener>();

/** The last OS permission read; null until it was read (or where notifications are unavailable). */
export const getNotificationPermission = (): NotificationPermission | null => permission;

export const subscribeNotificationPermission = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const applyPermission = (next: NotificationPermission): NotificationPermission => {
  if (
    permission === null ||
    permission.granted !== next.granted ||
    permission.canAskAgain !== next.canAskAgain
  ) {
    permission = next;
    for (const listener of listeners) listener();
  }
  progress().setNotificationsGranted(next.granted);
  return next;
};

/** Reads the OS permission and mirrors it into progress (`notifications.granted`). */
export const syncNotificationPermission = async (): Promise<NotificationPermission | null> => {
  const module = await loadModule();
  if (module === null) return null;
  try {
    const status = await module.getPermissionsAsync();
    return applyPermission({ granted: status.granted, canAskAgain: status.canAskAgain });
  } catch (error: unknown) {
    logger.warn('Reading the notification permission failed', error);
    return null;
  }
};

/** Localized strings for notifications, in the player's chosen language. */
const notificationT = () =>
  i18n.getFixedT(languageForPreference(useSettingsStore.getState().language));

const ensureChannel = async (module: NotificationsModule): Promise<void> => {
  const t = notificationT();
  await module.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
    name: t('notifications.channelName'),
    description: t('notifications.channelDescription'),
    importance: module.AndroidImportance.DEFAULT,
    lightColor: colors.accent,
  });
};

/**
 * Shows the system permission prompt (Android 13+; older versions report granted at once). The
 * channel is created first. Returns the resulting permission, or null where unavailable.
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission | null> => {
  const module = await loadModule();
  if (module === null) return null;
  try {
    await ensureChannel(module);
    const status = await module.requestPermissionsAsync();
    return applyPermission({ granted: status.granted, canAskAgain: status.canAskAgain });
  } catch (error: unknown) {
    logger.warn('Requesting the notification permission failed', error);
    return null;
  }
};

// ---------------------------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------------------------

/** The scheduling request for one planned notification, translated with `t`. */
export const toNotificationRequest = (
  module: Pick<NotificationsModule, 'SchedulableTriggerInputTypes'>,
  item: PlannedNotification,
  t: ReturnType<typeof notificationT>,
): NotificationRequestInput => ({
  identifier: item.id,
  content: {
    title: t(item.titleKey, item.params),
    body: t(item.bodyKey, item.params),
    data: { url: item.deepLink, kind: item.kind },
    color: colors.accent,
  },
  trigger: {
    type: module.SchedulableTriggerInputTypes.DATE,
    date: item.fireAt,
    channelId: REMINDERS_CHANNEL_ID,
  },
});

const runReschedule = async (): Promise<void> => {
  const module = await loadModule();
  if (module === null) return;
  try {
    await module.cancelAllScheduledNotificationsAsync();
    const plan = planNotifications(progress(), Date.now());
    if (plan.length === 0) return;
    await ensureChannel(module);
    const t = notificationT();
    for (const item of plan) {
      await module.scheduleNotificationAsync(toNotificationRequest(module, item, t));
    }
  } catch (error: unknown) {
    logger.warn('Scheduling notifications failed', error);
  }
};

let queue: Promise<void> = Promise.resolve();

/** Cancels everything and schedules the current plan. Runs one at a time, in call order. */
export const rescheduleNotifications = (): Promise<void> => {
  queue = queue.then(runReschedule);
  return queue;
};

/** The planner inputs that change during play (`lastOpenAt` moves only on foreground). */
const scheduleSignature = (state: ProgressState, language: string): string =>
  JSON.stringify([
    state.streak,
    state.lastDailyDate,
    state.streakFreezeWeek,
    state.lastGiftDate,
    state.giftDayIndex,
    state.level,
    state.entitlements.vip,
    state.notifications,
    language,
  ]);

// ---------------------------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------------------------

const handled = new Set<string>();

const responseKey = (response: NotificationResponse): string =>
  `${response.notification.request.identifier}@${response.notification.date}`;

/** The screen a tapped notification opens, or null when it was handled already or is not ours. */
const takeRoute = (response: NotificationResponse): NotificationRoute | null => {
  const key = responseKey(response);
  if (handled.has(key)) return null;
  handled.add(key);
  return routeForDeepLink(response.notification.request.content.data?.url);
};

const openRoute = (route: NotificationRoute): void => {
  if (route === '/daily') {
    router.navigate('/daily');
  } else if (router.canDismiss()) {
    router.dismissTo('/');
  } else {
    router.replace('/');
  }
};

/**
 * The screen of the notification tap that launched the app (cold start), or null. Call once during
 * start-up, before the first screen; the response is cleared so it is never handled twice.
 */
export const readLaunchRoute = async (): Promise<NotificationRoute | null> => {
  const module = await loadModule();
  if (module === null) return null;
  try {
    const response = module.getLastNotificationResponse();
    if (response === null) return null;
    module.clearLastNotificationResponse();
    return takeRoute(response);
  } catch (error: unknown) {
    logger.warn('Reading the launch notification failed', error);
    return null;
  }
};

// ---------------------------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------------------------

/**
 * Call once after the first frame. Installs the foreground handler and the tap listener, reads the
 * permission, schedules, and keeps the schedule current (foreground and debounced state changes).
 * Returns the cleanup function.
 */
export const startNotifications = (): (() => void) => {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeResponseListener: () => void = () => undefined;

  const cancelPending = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const scheduleSoon = (): void => {
    cancelPending();
    timer = setTimeout(() => {
      timer = null;
      void rescheduleNotifications();
    }, RESCHEDULE_DEBOUNCE_MS);
  };

  const refresh = (): void => {
    cancelPending();
    void syncNotificationPermission().then(() => rescheduleNotifications());
  };

  void loadModule().then((module) => {
    if (!active || module === null) return;
    try {
      module.setNotificationHandler({
        handleNotification: () =>
          Promise.resolve({
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
      });
      const subscription = module.addNotificationResponseReceivedListener((response) => {
        const route = takeRoute(response);
        if (route !== null) openRoute(route);
      });
      removeResponseListener = () => subscription.remove();
    } catch (error: unknown) {
      logger.warn('Notification handlers could not be installed', error);
    }
    refresh();
  });

  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    progress().touchForeground(Date.now());
    refresh();
  });

  let signature = scheduleSignature(progress(), useSettingsStore.getState().language);
  const onInputsChanged = (): void => {
    const next = scheduleSignature(progress(), useSettingsStore.getState().language);
    if (next === signature) return;
    signature = next;
    scheduleSoon();
  };
  const unsubscribeProgress = useProgressStore.subscribe(onInputsChanged);
  const unsubscribeSettings = useSettingsStore.subscribe(onInputsChanged);

  return () => {
    active = false;
    cancelPending();
    removeResponseListener();
    appState.remove();
    unsubscribeProgress();
    unsubscribeSettings();
  };
};
