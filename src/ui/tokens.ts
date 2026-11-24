export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fontSizes = {
  caption: 12,
  small: 14,
  body: 16,
  title: 20,
  heading: 28,
  display: 40,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/** Minimum touch target in dp for every interactive element. */
export const MIN_TOUCH_TARGET = 44;

export const zIndex = {
  base: 0,
  board: 1,
  hud: 10,
  overlay: 100,
  sheet: 200,
  toast: 300,
} as const;

/** Neutral chrome colors used until the theme system lands. */
export const colors = {
  background: '#0E1A2B',
  surface: '#1A2B44',
  surfacePressed: '#24395A',
  text: '#F4F8FF',
  textMuted: '#A9B8CF',
  accent: '#2EC4FF',
  onAccent: '#06121F',
} as const;
