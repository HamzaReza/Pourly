/**
 * Locale-aware formatting for the active language (spec §16): numbers with `Intl.NumberFormat`,
 * dates with `Intl.DateTimeFormat`. Formatters are cached per language and options.
 */
import { i18n } from './index';
import { RESOURCES, type SupportedLanguage } from './resources';

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

const language = (): string => i18n.language || 'en';

/** A whole number in the active language's digits and grouping. */
export const formatNumber = (value: number, minimumIntegerDigits = 1): string => {
  const key = `${language()}|${minimumIntegerDigits}`;
  let format = numberFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(language(), {
      maximumFractionDigits: 0,
      minimumIntegerDigits,
    });
    numberFormats.set(key, format);
  }
  return format.format(value);
};

/** A date in the active language with the given fields, e.g. `{ month: 'short', day: 'numeric' }`. */
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  const key = `${language()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(language(), options);
    dateFormats.set(key, format);
  }
  return format.format(date);
};

/** A language's own name for itself (`meta.nativeName` of its locale file). */
export const languageNativeName = (lng: SupportedLanguage): string =>
  RESOURCES[lng].translation.meta.nativeName;
