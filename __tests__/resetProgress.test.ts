import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { applyResetProgress } from '@/state/progressReducers';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const LATER = NOW + 10 * 86_400_000;

const played = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  installDate: '2026-11-01',
  sessionCount: 42,
  lastOpenAt: NOW,
  lastSeenAt: NOW + 5000,
  level: 57,
  stars: { 1: 3, 2: 2 },
  coins: 4321,
  hints: 9,
  undos: 7,
  extraTubes: 4,
  streak: 6,
  bestStreak: 11,
  lastDailyDate: '2026-11-23',
  dailyHistory: { '2026-11-23': { stars: 3, moves: 20 } },
  giftDayIndex: 5,
  lastGiftDate: '2026-11-23',
  lastVipClaimDate: '2026-11-23',
  streakFreezeWeek: '2026-W47',
  ownedThemes: ['classic', 'neon', 'ember'],
  activeTheme: 'neon',
  entitlements: { noAds: true, vip: false },
  processedTransactions: ['t1', 't2'],
  starterPackExpiresAt: NOW + 1000,
  starterPackPurchased: false,
  ads: { ...createDefaultProgress(NOW).ads, freeCoinsClaimsToday: 4, lastRewardedAt: NOW },
  notifications: { ...createDefaultProgress(NOW).notifications, asked: true, granted: true },
  review: { lastPromptAt: NOW, promptCount: 1, threeStarStreak: 2 },
  tutorialDone: true,
  lastSyncedBalances: { coins: 10, hints: 1, undos: 1, extraTubes: 1 },
  ...overrides,
});

describe('applyResetProgress', () => {
  it('clears play progress to a new player', () => {
    const fresh = createDefaultProgress(LATER);
    const next = applyResetProgress(played(), LATER);
    expect(next).toMatchObject({
      level: 1,
      stars: {},
      coins: fresh.coins,
      hints: fresh.hints,
      undos: fresh.undos,
      extraTubes: fresh.extraTubes,
      streak: 0,
      bestStreak: 0,
      lastDailyDate: null,
      dailyHistory: {},
      giftDayIndex: 0,
      lastGiftDate: null,
      lastVipClaimDate: null,
      streakFreezeWeek: null,
      ownedThemes: ['classic'],
      activeTheme: 'classic',
      tutorialDone: false,
      updatedAt: LATER,
    });
  });

  it('keeps purchases, the offer window, clocks, ad pacing and permissions', () => {
    const before = played();
    const next = applyResetProgress(before, LATER);
    expect(next).toMatchObject({
      installDate: '2026-11-01',
      sessionCount: 42,
      lastOpenAt: NOW,
      lastSeenAt: LATER,
      entitlements: { noAds: true, vip: false },
      processedTransactions: ['t1', 't2'],
      starterPackExpiresAt: NOW + 1000,
      starterPackPurchased: false,
      ads: before.ads,
      notifications: before.notifications,
      review: before.review,
      lastSyncedBalances: before.lastSyncedBalances,
    });
    expect(next.entitlements).not.toBe(before.entitlements);
  });

  it('a rolled-back clock never lowers lastSeenAt', () => {
    expect(applyResetProgress(played(), NOW).lastSeenAt).toBe(NOW + 5000);
  });

  it('keeps Aurora with the pack and an available active theme', () => {
    const pack = applyResetProgress(
      played({ starterPackPurchased: true, activeTheme: 'aurora' }),
      LATER,
    );
    expect(pack.ownedThemes).toEqual(['classic', 'aurora']);
    expect(pack.activeTheme).toBe('aurora');
    const gold = applyResetProgress(
      played({ activeTheme: 'gold', entitlements: { noAds: false, vip: true } }),
      LATER,
    );
    expect(gold.activeTheme).toBe('gold');
  });
});
