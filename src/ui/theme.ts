import { useReducedMotion } from 'react-native-reanimated';

import { effectiveThemeId } from '@/game/themeUnlocks';
import { getTheme, type Theme, type ThemeId, type ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';

import { alphas, withAlpha } from './tokens';

/**
 * Id of the theme to draw: the active theme while it is available, else Classic (Gold falls back
 * the moment VIP lapses). The selector returns a string, so only a theme change re-renders.
 */
export const useActiveThemeId = (): ThemeId =>
  useProgressStore((state) => effectiveThemeId(state.activeTheme, state));

/** The active theme. */
export const useActiveTheme = (): Theme => getTheme(useActiveThemeId());

/** UI colors of the active theme. */
export const useThemeUi = (): ThemeUi => useActiveTheme().ui;

/** The OS reduced-motion setting combined with the in-app override (spec §8.5.11). */
export const useReducedMotionPref = (): boolean => {
  const setting = useSettingsStore((state) => state.reducedMotion);
  const system = useReducedMotion();
  return setting === 'system' ? system : setting === 'on';
};

/**
 * Chrome colors derived from a theme's UI palette, so every card, list and control uses the same
 * hairline, pressed state and tint strengths.
 */
export const surfaceColors = (ui: ThemeUi) => ({
  /** Card and grouped-list background. */
  card: ui.surface,
  /** Separators and card outlines. */
  hairline: withAlpha(ui.textMuted, alphas.hairline),
  /** Row pressed state. */
  pressed: withAlpha(ui.textMuted, alphas.hairline),
  /** Unselected control tracks (switch off, segmented control). */
  track: withAlpha(ui.textMuted, alphas.tint - 0.02),
  /** Accent-tinted icon tiles. */
  accentTint: withAlpha(ui.accent, alphas.tint),
  /** Very light wash behind featured cards and art. */
  accentWash: withAlpha(ui.accent, alphas.subtle),
  /** Outline of a highlighted card. */
  accentBorder: withAlpha(ui.accent, alphas.border),
});
