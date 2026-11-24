import { PALETTE_SIZE } from '@/config/game';
import {
  BASE_COLORS,
  contrastRatio,
  deltaE76,
  hexDeltaE,
  hexToLab,
  LIQUID_COLORS,
  mix,
  relativeLuminance,
  SYMBOL_DARK,
  SYMBOL_LIGHT,
  SYMBOL_MIN_WHITE_CONTRAST,
} from '@/render/palette';

describe('palette', () => {
  it('keeps all pairwise CIE76 distances at least 15', () => {
    const failures: string[] = [];
    for (let i = 0; i < BASE_COLORS.length; i += 1) {
      for (let j = i + 1; j < BASE_COLORS.length; j += 1) {
        const first = BASE_COLORS[i] ?? '';
        const second = BASE_COLORS[j] ?? '';
        const distance = hexDeltaE(first, second);
        if (distance < 15) failures.push(`${first}/${second}: ${distance.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('has PALETTE_SIZE colors with valid hex', () => {
    expect(BASE_COLORS).toHaveLength(PALETTE_SIZE);
    expect(LIQUID_COLORS).toHaveLength(PALETTE_SIZE);
    for (const color of BASE_COLORS) expect(color).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(BASE_COLORS).size).toBe(PALETTE_SIZE);
  });

  it('converts to Lab matching reference values', () => {
    const white = hexToLab('#FFFFFF');
    expect(white.l).toBeCloseTo(100, 1);
    expect(white.a).toBeCloseTo(0, 1);
    expect(white.b).toBeCloseTo(0, 1);
    expect(hexToLab('#000000')).toEqual({ l: 0, a: 0, b: 0 });
    const red = hexToLab('#FF0000');
    expect(Math.abs(red.l - 53.24)).toBeLessThan(0.05);
    expect(Math.abs(red.a - 80.09)).toBeLessThan(0.05);
    expect(Math.abs(red.b - 67.2)).toBeLessThan(0.05);
  });

  it('has a symmetric deltaE76 that is zero on identity', () => {
    const a = hexToLab('#3A6BFF');
    const b = hexToLab('#8B5CF6');
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10);
    expect(deltaE76(a, a)).toBe(0);
    expect(deltaE76(a, b)).toBeGreaterThan(0);
  });

  it('derives lighter top and darker bottom gradient shades', () => {
    for (const color of LIQUID_COLORS) {
      expect(color.light).toBe(mix(color.base, '#FFFFFF', 0.12));
      expect(color.dark).toBe(mix(color.base, '#000000', 0.1));
      expect(relativeLuminance(color.light)).toBeGreaterThan(relativeLuminance(color.base));
      expect(relativeLuminance(color.dark)).toBeLessThan(relativeLuminance(color.base));
      for (const shade of [color.light, color.dark, color.stroke]) {
        expect(shade).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it('uses white symbols except on the three lightest colors', () => {
    const dark = LIQUID_COLORS.filter((color) => color.symbol === SYMBOL_DARK).map((c) => c.base);
    expect(dark).toEqual(['#FFD60A', '#C6F432', '#EAF6FF']);
    for (const color of LIQUID_COLORS) {
      const whiteReadable = contrastRatio(SYMBOL_LIGHT, color.base) >= SYMBOL_MIN_WHITE_CONTRAST;
      expect(color.symbol).toBe(whiteReadable ? SYMBOL_LIGHT : SYMBOL_DARK);
    }
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2EC4FF', '#2EC4FF')).toBe(1);
  });
});
