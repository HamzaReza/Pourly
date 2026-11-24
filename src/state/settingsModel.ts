import type { LanguagePreference } from '@/i18n';

export type ReducedMotionSetting = 'system' | 'on' | 'off';
export type QualitySetting = 'auto' | 'high' | 'low';

export interface SettingsState {
  sound: boolean;
  haptics: boolean;
  colorBlind: boolean;
  reducedMotion: ReducedMotionSetting;
  quality: QualitySetting;
  /**
   * Set by the frame-time monitor when `quality` is `auto` and the device could not hold the frame
   * budget (spec §8.5.6). Only consulted while `quality` is `auto`; choosing any quality clears it.
   */
  autoQualityDowngraded: boolean;
  language: LanguagePreference;
}

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: SettingsState = {
  sound: true,
  haptics: true,
  colorBlind: false,
  reducedMotion: 'system',
  quality: 'auto',
  autoQualityDowngraded: false,
  language: 'system',
};

export type EffectiveQuality = 'high' | 'low';

/** The quality the renderer uses: an explicit choice wins; `auto` follows the frame monitor. */
export const effectiveQuality = (
  quality: QualitySetting,
  autoQualityDowngraded: boolean,
): EffectiveQuality => {
  if (quality === 'auto') return autoQualityDowngraded ? 'low' : 'high';
  return quality;
};
