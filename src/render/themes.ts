/**
 * Board and UI themes (spec §10.5). Pure data plus lookups; no platform imports.
 * Text colors meet WCAG AA (4.5:1) against every background stop, and every liquid color stays at
 * least 15 CIE76 units from every background stop (checked by the theme tests).
 */
import { ECONOMY, type PurchasableThemeId } from '@/config/economy';

export type ThemeId = 'classic' | PurchasableThemeId | 'aurora' | 'gold';

export type ThemeUnlock =
  | { readonly kind: 'free' }
  | { readonly kind: 'coins'; readonly price: number }
  | { readonly kind: 'starterPack' }
  | { readonly kind: 'vip' };

export interface TubeStyle {
  /** Rim and lip stroke color, drawn at `rimOpacity`. */
  readonly rimColor: string;
  readonly rimOpacity: number;
  /** Left vertical highlight strip opacity (white). */
  readonly highlightOpacity: number;
  /** Fill inside the glass, drawn at `glassOpacity`. */
  readonly glassTint: string;
  readonly glassOpacity: number;
  readonly innerShadowOpacity: number;
  readonly shadowOpacity: number;
}

export interface ThemeUi {
  readonly text: string;
  readonly textMuted: string;
  readonly accent: string;
  /** Text and icons drawn on `accent`. */
  readonly onAccent: string;
  /** Opaque surface for HUD buttons and sheets. */
  readonly surface: string;
}

export interface Theme {
  readonly id: ThemeId;
  /** Vertical background gradient, top to bottom (2–3 stops). */
  readonly background: readonly string[];
  readonly tube: TubeStyle;
  /** Glow ring around the selected tube. */
  readonly glow: string;
  readonly ui: ThemeUi;
  readonly statusBar: 'light' | 'dark';
  readonly unlock: ThemeUnlock;
}

const glassTube = (overrides: Partial<TubeStyle> = {}): TubeStyle => ({
  rimColor: '#FFFFFF',
  rimOpacity: 0.22,
  highlightOpacity: 0.18,
  glassTint: '#FFFFFF',
  glassOpacity: 0.06,
  innerShadowOpacity: 0.22,
  shadowOpacity: 0.35,
  ...overrides,
});

const coins = (id: PurchasableThemeId): ThemeUnlock => ({
  kind: 'coins',
  price: ECONOMY.themePrices[id],
});

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  classic: {
    id: 'classic',
    background: ['#0E1A2B', '#16294A', '#1D3A63'],
    tube: glassTube(),
    glow: '#7FDBFF',
    ui: {
      text: '#F4F8FF',
      textMuted: '#A9B8CF',
      accent: '#2EC4FF',
      onAccent: '#06121F',
      surface: '#1A2B44',
    },
    statusBar: 'light',
    unlock: { kind: 'free' },
  },
  ember: {
    id: 'ember',
    background: ['#0D0707', '#2A0D0D', '#4A1410'],
    tube: glassTube(),
    glow: '#FF8A5B',
    ui: {
      text: '#FFF3EE',
      textMuted: '#D8B2A6',
      accent: '#FF7A45',
      onAccent: '#1A0805',
      surface: '#2E1210',
    },
    statusBar: 'light',
    unlock: coins('ember'),
  },
  sunset: {
    id: 'sunset',
    background: ['#2A0F35', '#5E1F4A', '#7E3F2C'],
    tube: glassTube({ glassTint: '#FFD3B5', glassOpacity: 0.07, rimColor: '#FFE7D6' }),
    glow: '#FFB38A',
    ui: {
      text: '#FFF4EC',
      textMuted: '#F2C9B8',
      accent: '#FF9F6B',
      onAccent: '#2A0F1A',
      surface: '#4A1A3E',
    },
    statusBar: 'light',
    unlock: coins('sunset'),
  },
  forest: {
    id: 'forest',
    background: ['#06140C', '#0D2A18', '#1A3D22'],
    tube: glassTube(),
    glow: '#B8F27C',
    ui: {
      text: '#F1FFF2',
      textMuted: '#A9C9AD',
      accent: '#9BE15D',
      onAccent: '#08160C',
      surface: '#13301D',
    },
    statusBar: 'light',
    unlock: coins('forest'),
  },
  candy: {
    id: 'candy',
    background: ['#FFD6EA', '#F7C3DE', '#E2C4F2'],
    tube: glassTube({
      rimColor: '#7A2E5E',
      rimOpacity: 0.3,
      highlightOpacity: 0.32,
      glassTint: '#FFFFFF',
      glassOpacity: 0.22,
      innerShadowOpacity: 0.14,
      shadowOpacity: 0.18,
    }),
    glow: '#D63384',
    ui: {
      text: '#3D0F2E',
      textMuted: '#6E2F57',
      accent: '#B0246E',
      onAccent: '#FFFFFF',
      surface: '#FFEAF4',
    },
    statusBar: 'dark',
    unlock: coins('candy'),
  },
  neon: {
    id: 'neon',
    background: ['#05020F', '#0E0426', '#1C0A3F'],
    tube: glassTube({
      rimColor: '#F0B6FF',
      rimOpacity: 0.3,
      glassTint: '#E879F9',
      glassOpacity: 0.05,
    }),
    glow: '#F72585',
    ui: {
      text: '#FBF5FF',
      textMuted: '#C4B2E3',
      accent: '#00F5D4',
      onAccent: '#05020F',
      surface: '#1A0B38',
    },
    statusBar: 'light',
    unlock: coins('neon'),
  },
  aurora: {
    id: 'aurora',
    background: ['#03161F', '#0A3340', '#251A4A'],
    tube: glassTube({ glassTint: '#B8FFE6', glassOpacity: 0.06 }),
    glow: '#7CFFCB',
    ui: {
      text: '#EFFFF9',
      textMuted: '#A9CFD0',
      accent: '#7CFFCB',
      onAccent: '#03161F',
      surface: '#0D2F3B',
    },
    statusBar: 'light',
    unlock: { kind: 'starterPack' },
  },
  gold: {
    id: 'gold',
    background: ['#140F05', '#2A200C', '#3F3112'],
    tube: glassTube({
      rimColor: '#F5D78E',
      rimOpacity: 0.4,
      highlightOpacity: 0.2,
      glassTint: '#FFE2A0',
      glassOpacity: 0.06,
    }),
    glow: '#FFD97A',
    ui: {
      text: '#FFF8E7',
      textMuted: '#D8C595',
      accent: '#F5C451',
      onAccent: '#1A1305',
      surface: '#2E2410',
    },
    statusBar: 'light',
    unlock: { kind: 'vip' },
  },
};

/** Display order for the Themes screen. */
export const THEME_IDS: readonly ThemeId[] = [
  'classic',
  'ember',
  'sunset',
  'forest',
  'candy',
  'neon',
  'aurora',
  'gold',
];

export const DEFAULT_THEME: Theme = THEMES.classic;

export const isThemeId = (id: string): id is ThemeId => Object.hasOwn(THEMES, id);

/** Theme by id; unknown ids (old saves, typos) fall back to Classic. */
export const getTheme = (id: string): Theme => (isThemeId(id) ? THEMES[id] : DEFAULT_THEME);

export const getThemeUnlock = (id: ThemeId): ThemeUnlock => THEMES[id].unlock;
