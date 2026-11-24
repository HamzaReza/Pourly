import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';
import type { LanguagePreference } from '@/i18n';

import { migrateSettings } from './migrations';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  type QualitySetting,
  type ReducedMotionSetting,
  type SettingsState,
} from './settingsModel';
import { createPersistStorage } from './storage';

export {
  DEFAULT_SETTINGS,
  effectiveQuality,
  SETTINGS_VERSION,
  type EffectiveQuality,
  type QualitySetting,
  type ReducedMotionSetting,
  type SettingsState,
} from './settingsModel';

export interface SettingsActions {
  setSound: (sound: boolean) => void;
  setHaptics: (haptics: boolean) => void;
  setColorBlind: (colorBlind: boolean) => void;
  setReducedMotion: (reducedMotion: ReducedMotionSetting) => void;
  /** An explicit choice; also clears `autoQualityDowngraded` so `auto` starts measuring afresh. */
  setQuality: (quality: QualitySetting) => void;
  /** Called by the frame-time monitor; ignored unless `quality` is `auto`. */
  markAutoQualityDowngraded: () => void;
  setLanguage: (language: LanguagePreference) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const pickSettings = (state: SettingsState): SettingsState => ({
  sound: state.sound,
  haptics: state.haptics,
  colorBlind: state.colorBlind,
  reducedMotion: state.reducedMotion,
  quality: state.quality,
  autoQualityDowngraded: state.autoQualityDowngraded,
  language: state.language,
});

export const useSettingsStore = create<SettingsStore>()(
  persist<SettingsStore, [], [], SettingsState>(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics }),
      setColorBlind: (colorBlind) => set({ colorBlind }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setQuality: (quality) => set({ quality, autoQualityDowngraded: false }),
      markAutoQualityDowngraded: () => {
        if (get().quality === 'auto') set({ autoQualityDowngraded: true });
      },
      setLanguage: (language) => set({ language }),
      resetSettings: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: SETTINGS_VERSION,
      storage: createPersistStorage<SettingsState>(),
      partialize: pickSettings,
      migrate: (persisted) => migrateSettings(persisted),
      merge: (persisted, current) =>
        persisted === undefined ? current : { ...current, ...migrateSettings(persisted) },
    },
  ),
);
