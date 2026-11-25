import { ads } from '@/services/ads';
import {
  claimFreeCoins,
  FREE_COINS_COOLDOWN_MS,
  freeCoinsStatus,
  type FreeCoinsFields,
} from '@/game/freeCoins';
import { watchFreeCoinsAd } from '@/state/metaFlow';
import { createDefaultProgress } from '@/state/progressModel';
import { applyClaimFreeCoins } from '@/state/progressReducers';
import { useProgressStore } from '@/state/progressStore';

jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const TODAY = '2026-11-24';
const showRewarded = ads.showRewarded as jest.Mock;

const fields = (
  overrides: Partial<FreeCoinsFields['ads']> = {},
  lastSeenAt = NOW,
): FreeCoinsFields => ({
  ads: { freeCoinsClaimsToday: 0, freeCoinsDate: null, lastFreeCoinsAt: 0, ...overrides },
  lastSeenAt,
});

describe('freeCoinsStatus', () => {
  it('is ready with 5 claims a day', () => {
    expect(freeCoinsStatus(fields(), TODAY, NOW)).toEqual({ kind: 'ready', remainingToday: 5 });
  });

  it('counts down the 5-minute cooldown', () => {
    const claimed = fields({ freeCoinsClaimsToday: 1, freeCoinsDate: TODAY, lastFreeCoinsAt: NOW });
    expect(freeCoinsStatus(claimed, TODAY, NOW + 60_000)).toEqual({
      kind: 'cooldown',
      remainingMs: FREE_COINS_COOLDOWN_MS - 60_000,
      remainingToday: 4,
    });
    expect(freeCoinsStatus(claimed, TODAY, NOW + FREE_COINS_COOLDOWN_MS)).toEqual({
      kind: 'ready',
      remainingToday: 4,
    });
  });

  it('caps at 5 per local day and resets the next day', () => {
    const capped = fields({ freeCoinsClaimsToday: 5, freeCoinsDate: TODAY, lastFreeCoinsAt: NOW });
    expect(freeCoinsStatus(capped, TODAY, NOW + 3_600_000).kind).toBe('dailyCap');
    expect(freeCoinsStatus(capped, '2026-11-25', NOW + 3_600_000)).toEqual({
      kind: 'ready',
      remainingToday: 5,
    });
  });

  it('is rollback safe: an earlier date blocks, a clock turned back keeps the cooldown', () => {
    const claimed = fields({ freeCoinsClaimsToday: 1, freeCoinsDate: TODAY, lastFreeCoinsAt: NOW });
    expect(freeCoinsStatus(claimed, '2026-11-23', NOW).kind).toBe('dailyCap');
    expect(freeCoinsStatus(fields({ freeCoinsDate: 'garbage' }), TODAY, NOW).kind).toBe('dailyCap');
    expect(freeCoinsStatus(claimed, TODAY, NOW - 3_600_000)).toMatchObject({
      kind: 'cooldown',
      remainingMs: FREE_COINS_COOLDOWN_MS,
    });
  });
});

describe('claiming', () => {
  it('records the claim from the trusted time', () => {
    expect(claimFreeCoins(fields({}, NOW + 10), TODAY, NOW)).toEqual({
      ads: { freeCoinsClaimsToday: 1, freeCoinsDate: TODAY, lastFreeCoinsAt: NOW + 10 },
      lastSeenAt: NOW + 10,
      coins: 50,
    });
    const earlier = fields({ freeCoinsClaimsToday: 4, freeCoinsDate: '2026-11-23' });
    expect(claimFreeCoins(earlier, TODAY, NOW)?.ads.freeCoinsClaimsToday).toBe(1);
  });

  it('grants 5 times a day with the cooldown between claims', () => {
    let state = { ...createDefaultProgress(NOW), lastSeenAt: NOW };
    let at = NOW;
    const granted: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      let result = applyClaimFreeCoins(state, TODAY, at);
      granted.push(result.coins);
      state = result.state;
      result = applyClaimFreeCoins(state, TODAY, at + 60_000);
      granted.push(result.coins);
      state = result.state;
      at += FREE_COINS_COOLDOWN_MS;
    }
    expect(granted.filter((coins) => coins > 0)).toHaveLength(5);
    expect(granted.slice(0, 4)).toEqual([50, 0, 50, 0]);
    expect(state.coins).toBe(100 + 250);
  });
});

describe('watchFreeCoinsAd', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    useProgressStore.setState({ ...createDefaultProgress(NOW), lastSeenAt: NOW });
  });
  afterEach(() => jest.useRealTimers());

  it('grants only on earned', async () => {
    showRewarded.mockResolvedValueOnce('dismissed');
    await expect(watchFreeCoinsAd()).resolves.toBe(0);
    expect(showRewarded).toHaveBeenCalledWith('FREE_COINS');
    showRewarded.mockResolvedValueOnce('earned');
    await expect(watchFreeCoinsAd()).resolves.toBe(50);
    expect(useProgressStore.getState().coins).toBe(150);
  });

  it('does not show the ad during the cooldown', async () => {
    showRewarded.mockResolvedValueOnce('earned');
    await watchFreeCoinsAd();
    showRewarded.mockClear();
    await expect(watchFreeCoinsAd()).resolves.toBe(0);
    expect(showRewarded).not.toHaveBeenCalled();
  });
});
