/**
 * The brand wordmark font, used only for the "Pourly" title on Home. When configured it loads at
 * runtime during startup, while the splash is still up, so the title never flashes in the
 * fallback font. A missing, failed or slow load never blocks the app: the title falls back to the
 * system font.
 *
 * To switch fonts, install the package (`npx expo install @expo-google-fonts/<name>`) and set
 * `BRAND_FONT`, for example:
 *
 *   import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
 *   export const BRAND_FONT: BrandFontConfig | null = {
 *     family: 'Fredoka-SemiBold',
 *     source: Fredoka_600SemiBold,
 *     letterSpacing: 0.5,
 *   };
 */
import { Grandstander_800ExtraBold } from '@expo-google-fonts/grandstander/800ExtraBold';
import * as Font from 'expo-font';

import { logger } from '@/utils/logger';

export interface BrandFontConfig {
  /** Family name the font is registered under (used as `fontFamily`). */
  readonly family: string;
  /** The font asset (`require('….ttf')` or an `@expo-google-fonts` export). */
  readonly source: Font.FontSource;
  /** Tracking that suits the face at display size. */
  readonly letterSpacing?: number;
}

/** The wordmark font (Grandstander ExtraBold); null would mean the system font. */
export const BRAND_FONT: BrandFontConfig | null = {
  family: 'Grandstander_800ExtraBold',
  source: Grandstander_800ExtraBold,
  letterSpacing: 0.5,
};

/** Startup waits at most this long for the font before showing the app with the fallback. */
export const BRAND_FONT_TIMEOUT_MS = 1500;

/** Family registered by `loadBrandFont` (expo-font also reports it once loaded). */
let loadedFamily: string | null = null;

/** True once the configured brand font is registered (the title uses it from then on). */
export const isBrandFontLoaded = (font: BrandFontConfig | null = BRAND_FONT): boolean =>
  font !== null && (loadedFamily === font.family || Font.isLoaded(font.family));

/**
 * Loads `font` (the configured brand font by default); resolves to whether it is available.
 * Never rejects and never takes longer than `timeoutMs`. Resolves false at once when no font is
 * configured.
 */
export const loadBrandFont = async (
  font: BrandFontConfig | null = BRAND_FONT,
  timeoutMs: number = BRAND_FONT_TIMEOUT_MS,
): Promise<boolean> => {
  if (font === null) return false;
  if (isBrandFontLoaded(font)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const load = Font.loadAsync({ [font.family]: font.source })
    .then(() => {
      loadedFamily = font.family;
      return true;
    })
    .catch((error: unknown) => {
      logger.warn('Brand font failed to load; using the system font', error);
      return false;
    });
  try {
    return await Promise.race([load, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/** Text style for the wordmark: the brand font when loaded, else the system font in heavy. */
export const brandTitleFont = (
  font: BrandFontConfig | null = BRAND_FONT,
): { fontFamily?: string; fontWeight?: '800'; letterSpacing: number } =>
  font !== null && isBrandFontLoaded(font)
    ? { fontFamily: font.family, letterSpacing: font.letterSpacing ?? 0 }
    : { fontWeight: '800', letterSpacing: -0.5 };
