import type { LanguagePreference } from '@/i18n';

export type ReducedMotionSetting = 'system' | 'on' | 'off';
export type QualitySetting = 'auto' | 'high' | 'low';

export interface SettingsState {
  sound: boolean;
  haptics: boolean;
  colorBlind: boolean;
  reducedMotion: ReducedMotionSetting;
  quality: QualitySetting;
  language: LanguagePreference;
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: SettingsState = {
  sound: true,
  haptics: true,
  colorBlind: false,
  reducedMotion: 'system',
  quality: 'auto',
  language: 'system',
};
