import { migrateProgress, migrateSettings } from '@/state/migrations';
import {
  createDefaultProgress,
  MAX_PROCESSED_TRANSACTIONS,
  PROGRESS_VERSION,
} from '@/state/progressModel';
import { DEFAULT_SETTINGS } from '@/state/settingsModel';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

describe('migrateProgress', () => {
  it('returns defaults for empty or garbage input', () => {
    const defaults = createDefaultProgress(NOW);
    expect(migrateProgress(undefined, 0, NOW)).toEqual(defaults);
    expect(migrateProgress(null, 0, NOW)).toEqual(defaults);
    expect(migrateProgress('corrupt', 1, NOW)).toEqual(defaults);
    expect(migrateProgress([1, 2, 3], 1, NOW)).toEqual(defaults);
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const result = migrateProgress(
      {
        level: 42,
        coins: 1234,
        hints: -5,
        undos: 'many',
        extraTubes: 2.9,
        streak: Number.NaN,
        lastDailyDate: '2026-11-23',
        lastGiftDate: 'yesterday',
        entitlements: { noAds: true, vip: 'yes' },
        ads: { levelsSinceInterstitial: 2, lastRewardedAt: 'x' },
      },
      1,
      NOW,
    );
    const d = createDefaultProgress(NOW);
    expect(result.schemaVersion).toBe(PROGRESS_VERSION);
    expect(result.level).toBe(42);
    expect(result.coins).toBe(1234);
    expect(result.hints).toBe(d.hints);
    expect(result.undos).toBe(d.undos);
    expect(result.extraTubes).toBe(2);
    expect(result.streak).toBe(d.streak);
    expect(result.lastDailyDate).toBe('2026-11-23');
    expect(result.lastGiftDate).toBe(d.lastGiftDate);
    expect(result.entitlements).toEqual({ noAds: true, vip: false });
    expect(result.ads.levelsSinceInterstitial).toBe(2);
    expect(result.ads.lastRewardedAt).toBe(d.ads.lastRewardedAt);
  });

  it('never allows a level below 1', () => {
    expect(migrateProgress({ level: 0 }, 1, NOW).level).toBe(1);
  });

  it('drops invalid stars and daily history entries', () => {
    const result = migrateProgress(
      {
        stars: { '1': 3, '2': 4, abc: 2, '0': 1, '5': 1 },
        dailyHistory: { '2026-11-20': { stars: 2, moves: 30 }, bad: { stars: 1, moves: 1 } },
      },
      1,
      NOW,
    );
    expect(result.stars).toEqual({ 1: 3, 5: 1 });
    expect(result.dailyHistory).toEqual({ '2026-11-20': { stars: 2, moves: 30 } });
  });

  it('dedupes processed transactions and keeps only the newest 200', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `tx_${i}`);
    const result = migrateProgress({ processedTransactions: ['tx_0', ...ids, 7] }, 1, NOW);
    expect(result.processedTransactions).toHaveLength(MAX_PROCESSED_TRANSACTIONS);
    expect(result.processedTransactions[0]).toBe('tx_50');
    expect(result.processedTransactions.at(-1)).toBe('tx_249');
  });

  it('always owns the classic theme and falls back when the active theme is not owned', () => {
    const result = migrateProgress({ ownedThemes: ['mint', 'mint'], activeTheme: 'neon' }, 1, NOW);
    expect(result.ownedThemes).toEqual(['classic', 'mint']);
    expect(result.activeTheme).toBe('classic');
    expect(migrateProgress({ ownedThemes: ['mint'], activeTheme: 'mint' }, 1, NOW).activeTheme).toBe(
      'mint',
    );
  });

  it('sanitizes last synced balances', () => {
    expect(migrateProgress({ lastSyncedBalances: 'x' }, 1, NOW).lastSyncedBalances).toBeNull();
    expect(
      migrateProgress({ lastSyncedBalances: { coins: 10, hints: -1 } }, 1, NOW).lastSyncedBalances,
    ).toEqual({ coins: 10, hints: 0, undos: 0, extraTubes: 0 });
  });

  it('treats unversioned data as version 0 without throwing', () => {
    expect(migrateProgress({ coins: 5 }, Number.NaN, NOW).coins).toBe(5);
  });
});

describe('migrateSettings', () => {
  it('fills missing and invalid settings from defaults', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      migrateSettings({ sound: false, reducedMotion: 'sometimes', quality: 'low', language: '' }),
    ).toEqual({ ...DEFAULT_SETTINGS, sound: false, quality: 'low' });
  });
});
