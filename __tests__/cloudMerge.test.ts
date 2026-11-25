import {
  cloudFingerprint,
  isNewerCloudSchema,
  MAX_CLOUD_DAILY_HISTORY,
  mergeProgress,
  parseCloudSnapshot,
  pickCloudProgress,
  type CloudProgress,
} from '@/services/cloudMerge';
import { createDefaultProgress, type Balances } from '@/state/progressModel';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const cloud = (overrides: Partial<CloudProgress> = {}): CloudProgress => ({
  ...pickCloudProgress(createDefaultProgress(NOW)),
  ...overrides,
});

const baseline = (overrides: Partial<Balances> = {}): Balances => ({
  coins: 100,
  hints: 3,
  undos: 0,
  extraTubes: 1,
  ...overrides,
});

const days = (year: number, count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const date = new Date(year, 0, 1 + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return [key, { stars: 1, moves: 10 }];
    }),
  );

describe('mergeProgress balances', () => {
  it('uploads the device copy when the account has no cloud save', () => {
    const local = cloud({ coins: 70, level: 4 });
    const result = mergeProgress(local, null, null);
    expect(result.progress).toEqual(local);
    expect(result.baseline).toEqual({ coins: 70, hints: 3, undos: 0, extraTubes: 1 });
  });

  it('applies the offline delta once on top of the server value', () => {
    // Since the last sync: this device spent 30 coins and earned 2 hints; another device added 50.
    const result = mergeProgress(
      cloud({ coins: 70, hints: 5 }),
      cloud({ coins: 150, hints: 3 }),
      baseline({ coins: 100, hints: 3 }),
    );
    expect(result.progress.coins).toBe(120);
    expect(result.progress.hints).toBe(5);
    expect(result.baseline.coins).toBe(120);
  });

  it('is idempotent: merging the merged copy again changes nothing', () => {
    const first = mergeProgress(cloud({ coins: 70 }), cloud({ coins: 150 }), baseline());
    const again = mergeProgress(first.progress, first.progress, first.baseline);
    expect(again.progress).toEqual(first.progress);
  });

  it('floors every balance at 0', () => {
    const result = mergeProgress(
      cloud({ coins: 0, undos: 0 }),
      cloud({ coins: 10, undos: 1 }),
      baseline({ coins: 500, undos: 9 }),
    );
    expect(result.progress.coins).toBe(0);
    expect(result.progress.undos).toBe(0);
  });

  it('takes the larger balance when there is no baseline', () => {
    const result = mergeProgress(
      cloud({ coins: 10, hints: 9, extraTubes: 0 }),
      cloud({ coins: 5000, hints: 1, extraTubes: 2 }),
      null,
    );
    expect(result.progress).toMatchObject({ coins: 5000, hints: 9, extraTubes: 2 });
    expect(result.decisions).toContain('no baseline: balances take the larger value');
  });
});

describe('mergeProgress progress fields', () => {
  const local = cloud({
    level: 12,
    stars: { 1: 3, 2: 1 },
    streak: 2,
    bestStreak: 3,
    lastDailyDate: '2026-11-20',
    dailyHistory: { '2026-11-20': { stars: 2, moves: 30 }, '2026-11-21': { stars: 3, moves: 12 } },
    giftDayIndex: 2,
    lastGiftDate: '2026-11-22',
    ownedThemes: ['classic', 'neon'],
    activeTheme: 'neon',
    processedTransactions: ['a', 'b'],
    starterPackPurchased: false,
  });
  const remote = cloud({
    level: 9,
    stars: { 2: 3, 5: 2 },
    streak: 5,
    bestStreak: 5,
    lastDailyDate: '2026-11-23',
    dailyHistory: { '2026-11-20': { stars: 3, moves: 40 }, '2026-11-21': { stars: 3, moves: 15 } },
    giftDayIndex: 5,
    lastGiftDate: '2026-11-21',
    ownedThemes: ['classic', 'ember'],
    activeTheme: 'ember',
    processedTransactions: ['b', 'c'],
    starterPackPurchased: true,
  });
  const merged = mergeProgress(local, remote, null).progress;

  it('keeps the highest level and the best stars per level', () => {
    expect(merged.level).toBe(12);
    expect(merged.stars).toEqual({ 1: 3, 2: 3, 5: 2 });
  });

  it('keeps the longest streaks and the later daily date', () => {
    expect(merged).toMatchObject({ streak: 5, bestStreak: 5, lastDailyDate: '2026-11-23' });
    const best = mergeProgress(cloud({ streak: 9, bestStreak: 4 }), cloud(), null).progress;
    expect(best.bestStreak).toBe(9);
  });

  it('unions daily history, preferring more stars then fewer moves', () => {
    expect(merged.dailyHistory).toEqual({
      '2026-11-20': { stars: 3, moves: 40 },
      '2026-11-21': { stars: 3, moves: 12 },
    });
  });

  it('takes the gift cycle from the side with the later claim (max index on a tie)', () => {
    expect([merged.giftDayIndex, merged.lastGiftDate]).toEqual([2, '2026-11-22']);
    const tie = mergeProgress(
      cloud({ giftDayIndex: 1, lastGiftDate: '2026-11-22' }),
      cloud({ giftDayIndex: 4, lastGiftDate: '2026-11-22' }),
      null,
    ).progress;
    expect(tie.giftDayIndex).toBe(4);
    const remoteLater = mergeProgress(
      cloud({ giftDayIndex: 6, lastGiftDate: null }),
      cloud({ giftDayIndex: 1, lastGiftDate: '2026-11-22' }),
      null,
    ).progress;
    expect([remoteLater.giftDayIndex, remoteLater.lastGiftDate]).toEqual([1, '2026-11-22']);
  });

  it('unions themes and transactions, keeps the device theme and any Starter Pack', () => {
    expect([...merged.ownedThemes].sort()).toEqual(['classic', 'ember', 'neon']);
    expect(merged.activeTheme).toBe('neon');
    expect(merged.processedTransactions).toEqual(['c', 'a', 'b']);
    expect(merged.starterPackPurchased).toBe(true);
  });

  it('logs a decision for each conflict', () => {
    const { decisions } = mergeProgress(local, remote, null);
    expect(decisions.some((line) => line.startsWith('level: device 12, cloud 9 → 12'))).toBe(true);
    expect(decisions.some((line) => line.startsWith('activeTheme'))).toBe(true);
  });
});

describe('caps', () => {
  it('keeps the latest 200 transaction ids with the device ids last', () => {
    const local = Array.from({ length: 150 }, (_, i) => `l${i}`);
    const remote = Array.from({ length: 150 }, (_, i) => `r${i}`);
    const merged = mergeProgress(
      cloud({ processedTransactions: local }),
      cloud({ processedTransactions: remote }),
      null,
    ).progress.processedTransactions;
    expect(merged).toHaveLength(200);
    expect(merged.at(-1)).toBe('l149');
    expect(merged[0]).toBe('r100');
  });

  it(`keeps the latest ${MAX_CLOUD_DAILY_HISTORY} daily results`, () => {
    const merged = mergeProgress(
      cloud({ dailyHistory: days(2026, 100) }),
      cloud({ dailyHistory: days(2025, 100) }),
      null,
    ).progress.dailyHistory;
    const keys = Object.keys(merged).sort();
    expect(keys).toHaveLength(MAX_CLOUD_DAILY_HISTORY);
    expect(keys.at(-1)).toBe('2026-04-10');
    expect(keys[0]?.startsWith('2025')).toBe(true);
  });

  it('caps the snapshot taken from local progress', () => {
    const state = {
      ...createDefaultProgress(NOW),
      dailyHistory: days(2026, 200),
      processedTransactions: Array.from({ length: 250 }, (_, i) => `t${i}`),
    };
    const snapshot = pickCloudProgress(state);
    expect(Object.keys(snapshot.dailyHistory)).toHaveLength(MAX_CLOUD_DAILY_HISTORY);
    expect(snapshot.processedTransactions).toHaveLength(200);
    expect(snapshot).not.toHaveProperty('entitlements');
  });
});

describe('parseCloudSnapshot', () => {
  it('sanitizes a stored document', () => {
    const parsed = parseCloudSnapshot({
      schemaVersion: 1,
      level: -3,
      coins: -5,
      hints: 2.7,
      stars: { '3': 2, x: 1, '4': 9 },
      ownedThemes: ['neon', 'neon', 7],
      lastDailyDate: 'yesterday',
      dailyHistory: { '2026-11-20': { stars: 3, moves: 9 }, bad: { stars: 1 } },
      activeTheme: '',
      processedTransactions: ['a', '', 'a', 'b'],
      starterPackPurchased: 'yes',
    });
    expect(parsed).toMatchObject({
      level: 1,
      coins: 0,
      hints: 2,
      stars: { 3: 2 },
      ownedThemes: ['classic', 'neon'],
      lastDailyDate: null,
      dailyHistory: { '2026-11-20': { stars: 3, moves: 9 } },
      activeTheme: 'classic',
      processedTransactions: ['a', 'b'],
      starterPackPurchased: false,
    });
  });

  it('rejects missing documents, unknown shapes and newer schemas', () => {
    expect(parseCloudSnapshot(null)).toBeNull();
    expect(parseCloudSnapshot({ level: 3 })).toBeNull();
    expect(parseCloudSnapshot({ schemaVersion: 2 })).toBeNull();
    expect(isNewerCloudSchema({ schemaVersion: 2 })).toBe(true);
    expect(isNewerCloudSchema({ schemaVersion: 1 })).toBe(false);
    expect(isNewerCloudSchema(null)).toBe(false);
  });
});

describe('cloudFingerprint', () => {
  it('changes only with synced fields and ignores key order', () => {
    const a = cloud({ stars: { 1: 3, 2: 2 } });
    const b = cloud({ stars: { 2: 2, 1: 3 } });
    expect(cloudFingerprint(a)).toBe(cloudFingerprint(b));
    expect(cloudFingerprint(cloud({ coins: 101 }))).not.toBe(cloudFingerprint(cloud()));
    const opened = { ...createDefaultProgress(NOW), sessionCount: 9, lastOpenAt: NOW + 5 };
    expect(cloudFingerprint(pickCloudProgress(opened))).toBe(cloudFingerprint(cloud()));
  });
});
