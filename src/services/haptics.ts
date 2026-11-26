/**
 * Haptic feedback (spec §15) through `expo-haptics`, all behind the in-game Settings toggle. Every
 * call is fire-and-forget; a device without a vibrator simply does nothing. On Android,
 * `patches/expo-haptics+*.patch` tags the vibrations as media/game usage, so the phone's system
 * "touch feedback" switch does not silence them: only the game's toggle does (DECISIONS P12.5).
 */
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/state/settingsStore';

const run = (effect: () => Promise<void>): void => {
  if (!useSettingsStore.getState().haptics) return;
  effect().catch(() => undefined);
};

/** Selection tick when a tube is selected. */
export const hapticSelect = (): void => run(() => Haptics.selectionAsync());

/** Light impact when a pour starts. */
export const hapticPourStart = (): void =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Success notification on a completed tube and on a win. */
export const hapticSuccess = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Error notification on an invalid move. */
export const hapticError = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Medium impact for HUD buttons; use sparingly. */
export const hapticButton = (): void =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
