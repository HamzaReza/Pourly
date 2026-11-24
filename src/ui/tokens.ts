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
  /** Coin glyph fill and rim. */
  coin: '#FFD60A',
  coinRim: '#C99A00',
  /** Dimmed backdrop behind overlays. */
  backdrop: 'rgba(4, 10, 20, 0.62)',
  /** Earned and missing stars. */
  star: '#FFD60A',
  starEmpty: 'rgba(255, 255, 255, 0.22)',
  /** Streak flame (icon only, never text). */
  flame: '#FF7A1A',
  /** Count badge on action buttons. */
  badge: '#C81E3A',
  onBadge: '#FFFFFF',
} as const;

/** Fills the parent with logical (RTL-safe) edges. */
export const fill = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  start: 0,
  end: 0,
} as const;
