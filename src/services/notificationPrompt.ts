/**
 * Notification permission soft-prompt (spec §14). Never on launch: the game screen offers it after
 * a level win, once the Win overlay is left (Next, Home or back), before that action continues.
 *
 * - First ask: after winning level 3 (or the first won level after it, when level 3 was skipped).
 * - Second ask: after winning level 15 or later, when the first one was declined.
 * - Never again after 2 asks, once permission is granted, or when Android will no longer show its
 *   prompt (`canAskAgain` false: denied twice, or blocked in settings). Never while the OS
 *   permission has not been read (Jest, or before start-up finished).
 * - Only "Allow" calls the system request.
 */
import type { NotificationsProgress } from '@/state/progressModel';
import { useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';

import { track } from './analytics';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from './notifications';

export const FIRST_PROMPT_LEVEL = 3;
export const SECOND_PROMPT_LEVEL = 15;
export const MAX_PROMPTS = 2;

export interface NotificationPromptInput {
  readonly mode: 'level' | 'daily' | 'replay';
  /** The level that was just finished. */
  readonly level: number;
  /** Finished with the SKIP_LEVEL ad (not a win). */
  readonly skipped: boolean;
  readonly notifications: Pick<NotificationsProgress, 'askedCount' | 'granted'>;
  /** The OS permission, or null when it has not been read. */
  readonly permission: NotificationPermission | null;
}

/** Whether the soft-prompt is due after this finished level. */
export const shouldOfferNotificationPrompt = ({
  mode,
  level,
  skipped,
  notifications,
  permission,
}: NotificationPromptInput): boolean => {
  if (mode !== 'level' || skipped) return false;
  if (notifications.granted || notifications.askedCount >= MAX_PROMPTS) return false;
  if (permission === null || permission.granted || !permission.canAskAgain) return false;
  const minLevel = notifications.askedCount === 0 ? FIRST_PROMPT_LEVEL : SECOND_PROMPT_LEVEL;
  return level >= minLevel;
};

/** The soft-prompt input for the session on screen; null unless it is a finished level. */
const currentInput = (): NotificationPromptInput | null => {
  const session = useGameStore.getState().session;
  if (session === null || session.status !== 'won' || session.result === null) return null;
  return {
    mode: session.mode,
    level: session.levelNumber,
    skipped: session.result.skipped,
    notifications: useProgressStore.getState().notifications,
    permission: getNotificationPermission(),
  };
};

/** True when the finished level on screen should be followed by the soft-prompt. */
export const notificationPromptDue = (): boolean => {
  const input = currentInput();
  return input !== null && shouldOfferNotificationPrompt(input);
};

/**
 * Records the player's answer. "Allow" shows the system prompt; the result is stored
 * (`asked`, `askedCount`, `granted`) and reported as `notification_prompt_result`.
 */
export const answerNotificationPrompt = async (allow: boolean): Promise<boolean> => {
  const result = allow ? await requestNotificationPermission() : null;
  const granted = result?.granted ?? false;
  const progress = useProgressStore.getState();
  progress.recordNotificationPrompt(granted);
  track('notification_prompt_result', {
    granted,
    askedCount: useProgressStore.getState().notifications.askedCount,
  });
  return granted;
};
