/**
 * Liquid palette (spec §8.4) and color math. Pure: no platform imports.
 * Every pair of base colors is at least 15 CIE76 units apart (checked by the palette tests).
 */
import { PALETTE_SIZE } from '@/config/game';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface LiquidColor {
  readonly id: number;
  readonly base: string;
  /** Top of the segment gradient: base mixed 12% toward white. */
  readonly light: string;
  /** Bottom of the segment gradient: base mixed 10% toward black. */
  readonly dark: string;
  /** Inner stroke: base mixed 35% toward white. */
  readonly stroke: string;
  /** Color-blind symbol color: white, or dark slate on colors too light for white to read. */
  readonly symbol: string;
}

export const BASE_COLORS: readonly string[] = [
  '#FF4D6D',
  '#FF9F1C',
  '#FFD60A',
  '#7ED957',
  '#00C2A8',
  '#2EC4FF',
  '#3A6BFF',
  '#8B5CF6',
  '#E056FD',
  '#FF7BAC',
  '#A47148',
  '#C6F432',
  '#EAF6FF',
  '#8C1C3B',
];

export const SYMBOL_LIGHT = '#FFFFFF';
export const SYMBOL_DARK = '#1F2A3A';
/** Below this white-on-color contrast the symbol switches to `SYMBOL_DARK`. */
export const SYMBOL_MIN_WHITE_CONTRAST = 1.5;

export const LIGHTEN_TOP = 0.12;
export const DARKEN_BOTTOM = 0.1;
const STROKE_LIGHTEN = 0.35;

/** Neutral slate tile for mystery segments. */
export const HIDDEN_COLORS = {
  light: '#7A879B',
  base: '#5F6B7E',
  dark: '#4A5466',
  stroke: '#97A3B6',
  glyph: '#F2F5FA',
} as const;

export const parseHex = (hex: string): Rgb => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null || match[1] === undefined) throw new Error(`Invalid hex color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

const toHexByte = (value: number): string =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export const toHex = ({ r, g, b }: Rgb): string => `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;

/** Per-channel mix of `hex` toward `target` by `amount` (0..1), in gamma-encoded sRGB. */
export const mix = (hex: string, target: string, amount: number): string => {
  const from = parseHex(hex);
  const to = parseHex(target);
  return toHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
};

export const lighten = (hex: string, amount: number): string => mix(hex, '#FFFFFF', amount);
export const darken = (hex: string, amount: number): string => mix(hex, '#000000', amount);

const srgbToLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** D65 reference white. */
const WHITE_X = 0.95047;
const WHITE_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const labF = (t: number): number => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** sRGB hex → CIE L*a*b* (D65). */
export const hexToLab = (hex: string): Lab => {
  const { r, g, b } = parseHex(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE_X;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE_Z;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

/** CIE76 color difference (Euclidean distance in Lab). */
export const deltaE76 = (first: Lab, second: Lab): number =>
  Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);

export const hexDeltaE = (first: string, second: string): number =>
  deltaE76(hexToLab(first), hexToLab(second));

/** WCAG 2.x relative luminance. */
export const relativeLuminance = (hex: string): number => {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
};

/** WCAG 2.x contrast ratio (1..21). */
export const contrastRatio = (first: string, second: string): number => {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Every liquid color with its gradient shades, computed once at module load. */
export const LIQUID_COLORS: readonly LiquidColor[] = BASE_COLORS.map((base, id) => ({
  id,
  base,
  light: lighten(base, LIGHTEN_TOP),
  dark: darken(base, DARKEN_BOTTOM),
  stroke: lighten(base, STROKE_LIGHTEN),
  symbol:
    contrastRatio(SYMBOL_LIGHT, base) >= SYMBOL_MIN_WHITE_CONTRAST ? SYMBOL_LIGHT : SYMBOL_DARK,
}));

if (LIQUID_COLORS.length !== PALETTE_SIZE) {
  throw new Error(`Palette has ${LIQUID_COLORS.length} colors, expected ${PALETTE_SIZE}`);
}

/** Color for a palette id; ids outside the palette wrap around. */
export const liquidColor = (id: number): LiquidColor => {
  const index = ((Math.floor(id) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  const color = LIQUID_COLORS[index];
  if (color === undefined) throw new Error(`No palette color ${id}`);
  return color;
};
