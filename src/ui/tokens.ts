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
  /** Icon tiles inside rows and cards. */
  tile: 8,
  md: 12,
  /** Cards and grouped list sections. */
  card: 16,
  lg: 20,
  /** Dialogs and bottom sheets. */
  dialog: 24,
  xl: 28,
  pill: 999,
} as const;

export const fontSizes = {
  /** Uppercase tags and ribbons only. */
  micro: 10,
  caption: 12,
  footnote: 13,
  small: 14,
  callout: 15,
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

/** Heights of the shared controls: `sm` price pills and segments, `md` card actions, `lg` CTAs. */
export const controlHeights = {
  sm: 34,
  md: 40,
  lg: 48,
} as const;

/** Height of compact controls (price pills, segmented controls); rows keep the 44 dp target. */
export const COMPACT_CONTROL = controlHeights.sm;

/**
 * Opacity steps for colors derived from the theme with `withAlpha`: tinted icon tiles, washes
 * behind featured cards, hairline separators and pressed rows.
 */
export const alphas = {
  wash: 0.05,
  subtle: 0.08,
  tint: 0.16,
  hairline: 0.2,
  border: 0.45,
} as const;

/**
 * Android elevation levels. The dark themes stay mostly flat (surfaces are separated by tone and
 * hairlines); elevation is for things that float over content.
 */
export const elevation = {
  flat: 0,
  raised: 2,
  floating: 8,
} as const;

/**
 * Named text styles: the one typography scale for every screen. Components spread these and add
 * only a color, so sizes and weights stay consistent app-wide.
 */
export const typography = {
  /** Screen header title. */
  screenTitle: {
    fontSize: fontSizes.title - 2,
    fontWeight: fontWeights.bold,
  },
  /** Dialog and sheet titles. */
  dialogTitle: {
    fontSize: fontSizes.title + 2,
    fontWeight: fontWeights.heavy,
    textAlign: 'center',
  },
  /** Dialog and sheet message. */
  dialogBody: {
    fontSize: fontSizes.callout,
    lineHeight: 21,
    textAlign: 'center',
  },
  /** Big numbers (rewards, streaks, balances in dialogs). */
  stat: {
    fontSize: fontSizes.heading - 2,
    fontWeight: fontWeights.heavy,
    fontVariant: ['tabular-nums'],
  },
  /** Uppercase header above a group ("SOUND AND FEEL"). */
  sectionLabel: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Card and hero titles. */
  cardTitle: {
    fontSize: fontSizes.body + 1,
    fontWeight: fontWeights.heavy,
  },
  /** Primary text of a list row. */
  rowTitle: {
    fontSize: fontSizes.callout,
    fontWeight: fontWeights.semibold,
  },
  /** Emphasized row title (product names). */
  rowTitleStrong: {
    fontSize: fontSizes.callout,
    fontWeight: fontWeights.bold,
  },
  /** Secondary text under a row title. */
  rowHint: {
    fontSize: fontSizes.footnote,
    lineHeight: 17,
  },
  /** Body copy inside cards (benefits, descriptions). */
  cardBody: {
    fontSize: fontSizes.footnote,
    lineHeight: 18,
  },
  /** Legal notes and footers. */
  fine: {
    fontSize: fontSizes.caption,
    lineHeight: 16,
  },
  /** Inline text links. */
  link: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.semibold,
  },
  /** Labels of compact controls (price pills, segments). */
  control: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
  },
  /** Uppercase tags and ribbons. */
  tag: {
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.heavy,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
} as const;

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
  /** Destructive actions (reset progress, delete account): icon tint only. */
  danger: '#FF5A6E',
  /** Positive state (done, claimed): icon tint only. */
  success: '#3DDC97',
} as const;

/**
 * `#RRGGBB` with an alpha channel (`#RRGGBBAA`), for tints and hairlines derived from theme
 * colors. Other formats are returned unchanged.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0').toUpperCase()}`;
};

/** Fills the parent with logical (RTL-safe) edges. */
export const fill = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  start: 0,
  end: 0,
} as const;
