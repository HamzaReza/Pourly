import { ECONOMY } from '@/config/economy';
import { BASE_COLORS, contrastRatio, hexDeltaE } from '@/render/palette';
import { DEFAULT_THEME, getTheme, getThemeUnlock, THEME_IDS, THEMES } from '@/render/themes';

const themes = THEME_IDS.map((id) => THEMES[id]);

describe('themes', () => {
  it('has 8 themes whose ids match THEME_IDS and the coin price keys', () => {
    expect(THEME_IDS).toEqual([
      'classic',
      'ember',
      'sunset',
      'forest',
      'candy',
      'neon',
      'aurora',
      'gold',
    ]);
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
    for (const id of Object.keys(ECONOMY.themePrices)) expect(THEME_IDS).toContain(id);
  });

  it('keeps text and muted text at WCAG AA on every background stop and the surface', () => {
    for (const theme of themes) {
      for (const background of [...theme.background, theme.ui.surface]) {
        expect(contrastRatio(theme.ui.text, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.ui.textMuted, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps onAccent at WCAG AA on accent', () => {
    for (const theme of themes) {
      expect(contrastRatio(theme.ui.onAccent, theme.ui.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every liquid color at least ΔE 15 from every background stop', () => {
    for (const theme of themes) {
      for (const background of theme.background) {
        for (const color of BASE_COLORS) {
          expect(hexDeltaE(color, background)).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });

  it('declares the unlock source per theme', () => {
    expect(getThemeUnlock('classic')).toEqual({ kind: 'free' });
    for (const [id, price] of Object.entries(ECONOMY.themePrices)) {
      expect(getTheme(id).unlock).toEqual({ kind: 'coins', price });
    }
    expect(getThemeUnlock('aurora')).toEqual({ kind: 'starterPack' });
    expect(getThemeUnlock('gold')).toEqual({ kind: 'vip' });
  });

  it('falls back to classic for unknown ids', () => {
    expect(getTheme('midnight')).toBe(DEFAULT_THEME);
    expect(getTheme('')).toBe(THEMES.classic);
    expect(getTheme('toString')).toBe(THEMES.classic);
    expect(getTheme('neon')).toBe(THEMES.neon);
  });

  it('uses 2–3 gradient stops and a light or dark status bar', () => {
    for (const theme of themes) {
      expect(theme.background.length).toBeGreaterThanOrEqual(2);
      expect(theme.background.length).toBeLessThanOrEqual(3);
      expect(['light', 'dark']).toContain(theme.statusBar);
    }
  });
});
