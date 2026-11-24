import { getLocales } from 'expo-localization';
import { createInstance, type i18n as I18n } from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

import {
  FALLBACK_LANGUAGE,
  RESOURCES,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './resources';

/** The app's single i18next instance, bound to react-i18next on first init. */
export const i18n: I18n = createInstance();

export { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from './resources';

/** `'system'` follows the device; any other value is a requested language tag. */
export type LanguagePreference = 'system' | string;

export interface DeviceLocale {
  languageTag: string;
  languageCode: string | null;
}

const isSupported = (tag: string): tag is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(tag);

/** Matches a tag exactly (`pt-BR`), then by base language (`pt`), case-insensitively. */
const matchTag = (tag: string): SupportedLanguage | null => {
  const lower = tag.toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find((lng) => lng.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split('-')[0] ?? lower;
  return SUPPORTED_LANGUAGES.find((lng) => lng.toLowerCase().split('-')[0] === base) ?? null;
};

/** Picks the language to use from the user override and the device's preferred locales. */
export const resolveLanguage = (
  preference: LanguagePreference,
  deviceLocales: readonly DeviceLocale[],
): SupportedLanguage => {
  if (preference !== 'system') {
    const override = isSupported(preference) ? preference : matchTag(preference);
    if (override) return override;
  }
  for (const locale of deviceLocales) {
    const match =
      matchTag(locale.languageTag) ?? (locale.languageCode ? matchTag(locale.languageCode) : null);
    if (match) return match;
  }
  return FALLBACK_LANGUAGE;
};

const readDeviceLocales = (): DeviceLocale[] => {
  try {
    return getLocales();
  } catch {
    return [];
  }
};

export const isRtlLanguage = (language: string): boolean =>
  RTL_LANGUAGES.includes(language.toLowerCase().split('-')[0] ?? '');

/**
 * Makes the native layout direction match `language` (RTL for Arabic). React Native only applies
 * `forceRTL` after the app restarts, so this returns true when a restart is needed; until then the
 * UI stays correct because every style uses logical start/end edges. LTR languages also turn
 * `allowRTL` off, so an RTL device locale cannot mirror an English UI.
 */
export const syncLayoutDirection = (language: string): boolean => {
  const rtl = isRtlLanguage(language);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
};

/**
 * Initializes i18next once, or switches language on later calls. Safe to call on every
 * language-setting change.
 */
export const initI18n = async (preference: LanguagePreference = 'system'): Promise<I18n> => {
  const language = resolveLanguage(preference, readDeviceLocales());
  if (i18n.isInitialized) {
    if (i18n.language !== language) await i18n.changeLanguage(language);
    return i18n;
  }
  await i18n.use(initReactI18next).init({
    resources: RESOURCES,
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
};
