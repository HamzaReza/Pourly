import type { ParseKeys } from 'i18next';

/** Any key of the English resources (type-checked against `en.json`). */
export type TranslationKey = ParseKeys;

/** Interpolation values for a translated string. */
export type TranslationParams = Readonly<Record<string, string | number>>;
