import en from './locales/en.json';

/**
 * Registered locales. To add one: drop `locales/<tag>.json` next to `en.json` and add one entry here.
 */
export const RESOURCES = {
  en: { translation: en },
} as const;

export type SupportedLanguage = keyof typeof RESOURCES;

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const SUPPORTED_LANGUAGES = Object.keys(RESOURCES) as SupportedLanguage[];

export const RTL_LANGUAGES: readonly string[] = ['ar'];
