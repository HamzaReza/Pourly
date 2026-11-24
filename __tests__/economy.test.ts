import { ECONOMY } from '@/config/economy';
import {
  canAfford,
  canSkip,
  freeUndosLeft,
  msUntilTimedSkip,
  resolveExtraTubeCost,
  resolveHintCost,
  resolveUndoCost,
  SKIP_AFTER_MS,
  winReward,
} from '@/game/economy';

describe('winReward', () => {
  it('adds the star bonus to the base', () => {
    const base = { hard: false, isVip: false, doubled: false };
    expect(winReward({ ...base, stars: 1 })).toBe(10);
    expect(winReward({ ...base, stars: 2 })).toBe(13);
    expect(winReward({ ...base, stars: 3 })).toBe(16);
  });

  it('doubles for hard, VIP and the ad, and the multipliers stack', () => {
    expect(winReward({ stars: 3, hard: true, isVip: false, doubled: false })).toBe(32);
    expect(winReward({ stars: 3, hard: false, isVip: true, doubled: false })).toBe(32);
    expect(winReward({ stars: 3, hard: false, isVip: false, doubled: true })).toBe(32);
    expect(winReward({ stars: 2, hard: true, isVip: true, doubled: true })).toBe(104);
    expect(winReward({ stars: 1, hard: true, isVip: true, doubled: true })).toBe(80);
  });
});

describe('canAfford', () => {
  it('is inclusive and rejects bad input', () => {
    expect(canAfford(10, 10)).toBe(true);
    expect(canAfford(9, 10)).toBe(false);
    expect(canAfford(Number.NaN, 0)).toBe(false);
    expect(canAfford(10, -1)).toBe(false);
  });
});

describe('resolveUndoCost', () => {
  it('uses the free undos first', () => {
    expect(freeUndosLeft(0)).toBe(ECONOMY.freeUndosPerLevel);
    expect(resolveUndoCost({ undosUsed: 0, inventory: 5, coins: 999 })).toEqual({
      kind: 'free',
      freeLeft: 3,
    });
    expect(resolveUndoCost({ undosUsed: 2, inventory: 0, coins: 0 })).toEqual({
      kind: 'free',
      freeLeft: 1,
    });
  });

  it('then inventory, then coins (boundary inclusive), then ad or shop', () => {
    expect(resolveUndoCost({ undosUsed: 3, inventory: 2, coins: 0 })).toEqual({
      kind: 'inventory',
      item: 'undos',
      owned: 2,
    });
    expect(resolveUndoCost({ undosUsed: 3, inventory: 0, coins: ECONOMY.undoCost })).toEqual({
      kind: 'coins',
      cost: ECONOMY.undoCost,
    });
    expect(resolveUndoCost({ undosUsed: 9, inventory: 0, coins: ECONOMY.undoCost - 1 })).toEqual({
      kind: 'adOrShop',
      cost: ECONOMY.undoCost,
    });
  });
});

describe('resolveHintCost', () => {
  it('inventory, then coins, then ad or shop', () => {
    expect(resolveHintCost({ inventory: 1, coins: 0 }).kind).toBe('inventory');
    expect(resolveHintCost({ inventory: 0, coins: 25 })).toEqual({ kind: 'coins', cost: 25 });
    expect(resolveHintCost({ inventory: 0, coins: 24 })).toEqual({ kind: 'adOrShop', cost: 25 });
  });
});

describe('resolveExtraTubeCost', () => {
  it('is unavailable once used, otherwise inventory, coins, ad', () => {
    expect(resolveExtraTubeCost({ extraTubeUsed: true, inventory: 5, coins: 999 })).toEqual({
      kind: 'unavailable',
    });
    expect(resolveExtraTubeCost({ extraTubeUsed: false, inventory: 1, coins: 0 }).kind).toBe(
      'inventory',
    );
    expect(resolveExtraTubeCost({ extraTubeUsed: false, inventory: 0, coins: 40 })).toEqual({
      kind: 'coins',
      cost: 40,
    });
    expect(resolveExtraTubeCost({ extraTubeUsed: false, inventory: 0, coins: 39 })).toEqual({
      kind: 'adOrShop',
      cost: 40,
    });
  });
});

describe('canSkip', () => {
  it('opens when stuck, after 3 restarts or after 2 minutes', () => {
    expect(canSkip({ stuck: false, restartsThisLevel: 2, elapsedMs: 119_999 })).toBe(false);
    expect(canSkip({ stuck: true, restartsThisLevel: 0, elapsedMs: 0 })).toBe(true);
    expect(canSkip({ stuck: false, restartsThisLevel: 3, elapsedMs: 0 })).toBe(true);
    expect(canSkip({ stuck: false, restartsThisLevel: 0, elapsedMs: 120_000 })).toBe(true);
  });

  it('reports the time left until the timed rule opens', () => {
    expect(msUntilTimedSkip(0)).toBe(SKIP_AFTER_MS);
    expect(msUntilTimedSkip(100_000)).toBe(20_000);
    expect(msUntilTimedSkip(500_000)).toBe(0);
  });
});
