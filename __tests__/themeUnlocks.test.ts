import { ECONOMY } from '@/config/economy';
import { effectiveThemeId, isThemeAvailable, themeStatus } from '@/game/themeUnlocks';
import { migrateProgress } from '@/state/migrations';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import {
  applySetActiveTheme,
  applyThemeFallback,
  applyUnlockTheme,
} from '@/state/progressReducers';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const progress = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  ...overrides,
});
const vip = { noAds: false, vip: true };

describe('theme status', () => {
  it('covers every unlock kind', () => {
    const owner = progress();
    expect(themeStatus('classic', owner)).toEqual({ kind: 'owned' });
    expect(themeStatus('ember', owner)).toEqual({
      kind: 'coins',
      price: ECONOMY.themePrices.ember,
    });
    expect(themeStatus('ember', progress({ ownedThemes: ['classic', 'ember'] }))).toEqual({
      kind: 'owned',
    });
    expect(themeStatus('aurora', owner)).toEqual({ kind: 'starterPack' });
    expect(themeStatus('aurora', progress({ starterPackPurchased: true }))).toEqual({
      kind: 'owned',
    });
    expect(themeStatus('aurora', progress({ ownedThemes: ['classic', 'aurora'] })).kind).toBe(
      'owned',
    );
    expect(themeStatus('gold', owner)).toEqual({ kind: 'vip' });
    expect(themeStatus('gold', progress({ entitlements: vip }))).toEqual({ kind: 'owned' });
    expect(themeStatus('gold', progress({ ownedThemes: ['classic', 'gold'] })).kind).toBe('vip');
  });

  it('effective theme falls back to classic when unavailable or unknown', () => {
    expect(isThemeAvailable('midnight', progress())).toBe(false);
    expect(effectiveThemeId('midnight', progress())).toBe('classic');
    expect(effectiveThemeId('gold', progress({ entitlements: vip }))).toBe('gold');
    expect(effectiveThemeId('gold', progress())).toBe('classic');
  });
});

describe('theme reducers', () => {
  it('unlocking a coin theme spends, adds and applies it', () => {
    const next = applyUnlockTheme(progress({ coins: 350 }), 'ember', NOW + 1);
    expect(next).toMatchObject({ coins: 50, activeTheme: 'ember', updatedAt: NOW + 1 });
    expect(next?.ownedThemes).toEqual(['classic', 'ember']);
  });

  it('refuses when too poor, already owned, not a coin theme or unknown', () => {
    expect(applyUnlockTheme(progress({ coins: 299 }), 'ember', NOW)).toBeNull();
    expect(
      applyUnlockTheme(progress({ coins: 999, ownedThemes: ['classic', 'ember'] }), 'ember', NOW),
    ).toBeNull();
    expect(applyUnlockTheme(progress({ coins: 9999 }), 'aurora', NOW)).toBeNull();
    expect(applyUnlockTheme(progress({ coins: 9999 }), 'gold', NOW)).toBeNull();
    expect(applyUnlockTheme(progress({ coins: 9999 }), 'classic', NOW)).toBeNull();
    expect(applyUnlockTheme(progress({ coins: 9999 }), 'mint', NOW)).toBeNull();
  });

  it('applies only available themes', () => {
    const state = progress({ ownedThemes: ['classic', 'neon'] });
    expect(applySetActiveTheme(state, 'neon', NOW)?.activeTheme).toBe('neon');
    expect(applySetActiveTheme(state, 'classic', NOW)).toBe(state);
    expect(applySetActiveTheme(state, 'candy', NOW)).toBeNull();
    expect(applySetActiveTheme(state, 'gold', NOW)).toBeNull();
    expect(applySetActiveTheme(progress({ entitlements: vip }), 'gold', NOW)?.activeTheme).toBe(
      'gold',
    );
  });

  it('falls back to classic when VIP lapses', () => {
    const gold = progress({ activeTheme: 'gold' });
    expect(applyThemeFallback(gold, NOW)).toMatchObject({ activeTheme: 'classic', updatedAt: NOW });
    const stillVip = progress({ activeTheme: 'gold', entitlements: vip });
    expect(applyThemeFallback(stillVip, NOW)).toBe(stillVip);
  });
});

describe('sanitize keeps an active VIP or Starter Pack theme only while available', () => {
  it('gold needs VIP, aurora needs the pack', () => {
    expect(migrateProgress({ activeTheme: 'gold', entitlements: vip }, 1, NOW).activeTheme).toBe(
      'gold',
    );
    expect(migrateProgress({ activeTheme: 'gold' }, 1, NOW).activeTheme).toBe('classic');
    expect(
      migrateProgress({ activeTheme: 'aurora', starterPackPurchased: true }, 1, NOW).activeTheme,
    ).toBe('aurora');
    expect(migrateProgress({ activeTheme: 'aurora' }, 1, NOW).activeTheme).toBe('classic');
    expect(
      migrateProgress({ ownedThemes: ['midnight'], activeTheme: 'midnight' }, 1, NOW).activeTheme,
    ).toBe('classic');
  });
});
