import { useReducedMotion } from 'react-native-reanimated';

import { getTheme, type Theme, type ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';

/** The active theme (narrow selector on `activeTheme`). */
export const useActiveTheme = (): Theme => getTheme(useProgressStore((state) => state.activeTheme));

/** UI colors of the active theme. */
export const useThemeUi = (): ThemeUi => useActiveTheme().ui;

/** The OS reduced-motion setting combined with the in-app override (spec §8.5.11). */
export const useReducedMotionPref = (): boolean => {
  const setting = useSettingsStore((state) => state.reducedMotion);
  const system = useReducedMotion();
  return setting === 'system' ? system : setting === 'on';
};
