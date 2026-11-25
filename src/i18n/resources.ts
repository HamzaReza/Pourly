import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';

/**
 * Registered locales. To add one: drop `locales/<tag>.json` next to `en.json` and add one entry here.
 * English is the source of truth; every other locale mirrors its keys (plural suffixes follow each
 * language's `Intl.PluralRules` categories).
 */
export const RESOURCES = {
  en: { translation: en },
  es: { translation: es },
  'pt-BR': { translation: ptBR },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  ru: { translation: ru },
  tr: { translation: tr },
  id: { translation: id },
  ar: { translation: ar },
  hi: { translation: hi },
  ja: { translation: ja },
  ko: { translation: ko },
} as const;

export type SupportedLanguage = keyof typeof RESOURCES;

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const SUPPORTED_LANGUAGES = Object.keys(RESOURCES) as SupportedLanguage[];

export const RTL_LANGUAGES: readonly string[] = ['ar'];
