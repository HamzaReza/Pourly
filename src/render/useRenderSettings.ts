import { useReducedMotion } from 'react-native-reanimated';

import { effectiveQuality, useSettingsStore } from '@/state/settingsStore';
import { useAdaptiveQualityMonitor } from '@/utils/perf';

import type { Quality } from './anim/effects';

export interface RenderSettings {
  readonly colorBlind: boolean;
  /** Effective quality (an explicit choice, or `auto` resolved by the frame monitor). */
  readonly quality: Quality;
  /** The OS setting combined with the in-app `reducedMotion` setting. */
  readonly reducedMotion: boolean;
}

/**
 * Board rendering settings with narrow store selectors. While quality is `auto` and not yet
 * downgraded, also runs the frame-time monitor that persists the downgrade (spec §8.5.6).
 */
export const useRenderSettings = (): RenderSettings => {
  const colorBlind = useSettingsStore((state) => state.colorBlind);
  const quality = useSettingsStore((state) => state.quality);
  const downgraded = useSettingsStore((state) => state.autoQualityDowngraded);
  const markDowngraded = useSettingsStore((state) => state.markAutoQualityDowngraded);
  const reducedMotionSetting = useSettingsStore((state) => state.reducedMotion);
  const systemReducedMotion = useReducedMotion();
  useAdaptiveQualityMonitor(quality === 'auto' && !downgraded, markDowngraded);
  return {
    colorBlind,
    quality: effectiveQuality(quality, downgraded),
    reducedMotion:
      reducedMotionSetting === 'system' ? systemReducedMotion : reducedMotionSetting === 'on',
  };
};
