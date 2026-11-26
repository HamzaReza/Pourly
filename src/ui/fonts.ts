/**
 * App-wide UI typeface (DM Sans) and how text picks it.
 *
 * Android does not synthesize weights for a custom family, so every weight is its own family
 * (`DMSans_700Bold`, …) and `uiFontFamily` maps a `fontWeight` to it. Text components never set a
 * family themselves: the shared `Text` (`@/ui/Text`) and `AnimatedCount` resolve it at render
 * from the style's `fontWeight`, which keeps every StyleSheet unchanged and lets the choice follow
 * the language at runtime.
 *
 * DM Sans covers Latin only. For languages written in other scripts (Cyrillic, Arabic, Devanagari,
 * CJK) the UI keeps the system font so a line never mixes typefaces. The brand wordmark
 * (`brandFont.ts`) is Latin in every language and always uses its own font.
 */
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { DMSans_800ExtraBold } from '@expo-google-fonts/dm-sans/800ExtraBold';
import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';
import type { TextStyle } from 'react-native';

import { logger } from '@/utils/logger';

/** The weights the design system uses (`fontWeights` in tokens). */
export type UiWeight = '400' | '500' | '600' | '700' | '800';

/** One registered family per weight. */
export const UI_FONT_FAMILIES: Readonly<Record<UiWeight, string>> = {
  '400': 'DMSans_400Regular',
  '500': 'DMSans_500Medium',
  '600': 'DMSans_600SemiBold',
  '700': 'DMSans_700Bold',
  '800': 'DMSans_800ExtraBold',
};

/** The font assets `loadUiFonts` registers, keyed by family. */
export const UI_FONT_SOURCES: Readonly<Record<string, Font.FontSource>> = {
  [UI_FONT_FAMILIES['400']]: DMSans_400Regular,
  [UI_FONT_FAMILIES['500']]: DMSans_500Medium,
  [UI_FONT_FAMILIES['600']]: DMSans_600SemiBold,
  [UI_FONT_FAMILIES['700']]: DMSans_700Bold,
  [UI_FONT_FAMILIES['800']]: DMSans_800ExtraBold,
};

/** Languages whose script DM Sans covers; every other language keeps the system font. */
const LATIN_LANGUAGES: ReadonlySet<string> = new Set([
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'tr',
  'id',
]);

/** True when `language` (a tag such as `pt-BR`) is written in a script DM Sans covers. */
export const usesUiFont = (language: string): boolean =>
  LATIN_LANGUAGES.has(language.toLowerCase().split('-')[0] ?? '');

/**
 * Normalizes a `fontWeight` to one of the design-system weights: numeric strings and numbers
 * round to the nearest provided weight, `bold` is 700 and anything else (`normal`, undefined) 400.
 */
export const normalizeWeight = (weight: TextStyle['fontWeight']): UiWeight => {
  if (weight === 'bold') return '700';
  const value = typeof weight === 'number' ? weight : Number(weight);
  if (!Number.isFinite(value)) return '400';
  if (value >= 750) return '800';
  if (value >= 650) return '700';
  if (value >= 550) return '600';
  if (value >= 450) return '500';
  return '400';
};

/** The DM Sans family for a `fontWeight`. */
export const uiFontFamily = (weight: TextStyle['fontWeight']): string =>
  UI_FONT_FAMILIES[normalizeWeight(weight)];

// ---------------------------------------------------------------------------------------------
// Which font the UI draws with right now (reactive)
// ---------------------------------------------------------------------------------------------

let fontsLoaded = false;
let language = 'en';
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

/** True when the UI should draw with DM Sans: it loaded and the language is Latin-script. */
export const uiFontActive = (): boolean => fontsLoaded && usesUiFont(language);

/** Tells the font switch the resolved UI language (call on every language change). */
export const setUiFontLanguage = (next: string): void => {
  if (next === language) return;
  const before = uiFontActive();
  language = next;
  if (uiFontActive() !== before) emit();
};

/** Marks DM Sans as available (`loadUiFonts` does this; tests can too). */
export const setUiFontsLoaded = (loaded: boolean): void => {
  if (loaded === fontsLoaded) return;
  fontsLoaded = loaded;
  emit();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Re-renders when the UI switches between DM Sans and the system font. */
export const useUiFontActive = (): boolean => useSyncExternalStore(subscribe, uiFontActive);

/**
 * The family-resolved version of a flattened text style: DM Sans for its weight (the weight
 * itself is dropped, the family carries it) when the UI font is active and the style does not
 * set its own family; the style unchanged otherwise.
 */
export const withUiFont = (
  style: TextStyle | undefined,
  active: boolean,
): TextStyle | undefined => {
  if (!active || style?.fontFamily !== undefined) return style;
  const { fontWeight, ...rest } = style ?? {};
  return { ...rest, fontFamily: uiFontFamily(fontWeight) };
};

/** Startup waits at most this long for the fonts before showing the app with the system font. */
export const UI_FONTS_TIMEOUT_MS = 1500;

/**
 * Registers the DM Sans weights. Resolves to whether they are available; never rejects and never
 * takes longer than `timeoutMs` (a late load still switches the UI over when it lands).
 */
export const loadUiFonts = async (timeoutMs: number = UI_FONTS_TIMEOUT_MS): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const load = Font.loadAsync({ ...UI_FONT_SOURCES })
    .then(() => {
      setUiFontsLoaded(true);
      return true;
    })
    .catch((error: unknown) => {
      logger.warn('UI font failed to load; using the system font', error);
      return false;
    });
  try {
    return await Promise.race([load, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
