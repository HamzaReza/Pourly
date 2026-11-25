import { ECONOMY } from '@/config/economy';
import {
  canClaimGift,
  canClaimVipBonus,
  CHEST_INDEX,
  claimGift,
  claimVipBonus,
  giftCycleIndex,
  nextGift,
  type GiftFields,
} from '@/game/gifts';
import { createDefaultProgress } from '@/state/progressModel';
import { applyClaimGift, applyClaimVipBonus } from '@/state/progressReducers';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const DAY = 86_400_000;
const TODAY = '2026-11-24';

const gift = (overrides: Partial<GiftFields> = {}): GiftFields => ({
  giftDayIndex: 0,
  lastGiftDate: null,
  lastSeenAt: NOW - 1000,
  ...overrides,
});

const dateOf = (offset: number) => {
  const d = new Date(NOW + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('daily gift', () => {
  it('canClaimGift: never claimed, a later day or an unreadable date are claimable', () => {
    expect(canClaimGift({ lastGiftDate: null }, TODAY)).toBe(true);
    expect(canClaimGift({ lastGiftDate: '2026-11-23' }, TODAY)).toBe(true);
    expect(canClaimGift({ lastGiftDate: 'broken' }, TODAY)).toBe(true);
    expect(canClaimGift({ lastGiftDate: TODAY }, TODAY)).toBe(false);
    expect(canClaimGift({ lastGiftDate: '2026-11-25' }, TODAY)).toBe(false);
    expect(() => canClaimGift({ lastGiftDate: null }, '24/11/2026')).toThrow();
  });

  it('walks the cycle day 1 → 7 (chest) and wraps', () => {
    let state = gift();
    for (let day = 0; day < 8; day += 1) {
      const claim = claimGift(state, { today: dateOf(day), now: NOW + day * DAY, isVip: false });
      if (claim.kind !== 'granted') throw new Error(claim.kind);
      const index = day % 7;
      expect(claim.day).toBe(index + 1);
      expect(claim.chest).toBe(index === CHEST_INDEX);
      expect(claim.reward).toEqual(ECONOMY.dailyGiftCycle[index]);
      state = claim.state;
    }
    expect(state.giftDayIndex).toBe(1);
  });

  it('a missed day continues the cycle', () => {
    const claim = claimGift(gift({ giftDayIndex: 3, lastGiftDate: '2026-11-18' }), {
      today: TODAY,
      now: NOW,
      isVip: false,
    });
    expect(claim).toMatchObject({ kind: 'granted', day: 4, reward: { undos: 2 } });
  });

  it('VIP doubles the gift', () => {
    const claim = claimGift(gift({ giftDayIndex: 6 }), { today: TODAY, now: NOW, isVip: true });
    expect(claim).toMatchObject({
      kind: 'granted',
      chest: true,
      reward: { coins: 300, hints: 6, extraTubes: 6 },
    });
  });

  it('second claim the same day and clock rollback grant nothing', () => {
    const today = gift({ lastGiftDate: TODAY, giftDayIndex: 2 });
    expect(claimGift(today, { today: TODAY, now: NOW, isVip: false })).toEqual({
      kind: 'alreadyClaimed',
    });
    expect(
      claimGift(gift({ lastGiftDate: '2026-11-25' }), { today: TODAY, now: NOW, isVip: false }),
    ).toEqual({ kind: 'clockRollback' });
    expect(
      claimGift(gift({ lastSeenAt: NOW + 1 }), { today: TODAY, now: NOW, isVip: false }),
    ).toEqual({ kind: 'clockRollback' });
  });

  it('records the claim and never moves lastSeenAt backwards', () => {
    const claim = claimGift(gift({ lastSeenAt: NOW - 5 }), {
      today: TODAY,
      now: NOW,
      isVip: false,
    });
    expect(claim).toMatchObject({
      kind: 'granted',
      state: { giftDayIndex: 1, lastGiftDate: TODAY, lastSeenAt: NOW },
    });
  });

  it('giftCycleIndex folds corrupt values into the cycle', () => {
    expect(giftCycleIndex(9)).toBe(2);
    expect(giftCycleIndex(-1)).toBe(6);
    expect(giftCycleIndex(Number.NaN)).toBe(0);
    expect(giftCycleIndex(3.7)).toBe(3);
    expect(nextGift(13)).toEqual(ECONOMY.dailyGiftCycle[6]);
  });

  it('applyClaimGift grants the reward and updates the fields; a refusal keeps the state', () => {
    const state = { ...createDefaultProgress(NOW), lastSeenAt: 0 };
    const { state: next, claim } = applyClaimGift(state, TODAY, NOW);
    expect(claim.kind).toBe('granted');
    expect(next).toMatchObject({ coins: 120, giftDayIndex: 1, lastGiftDate: TODAY });
    const again = applyClaimGift(next, TODAY, NOW + 1000);
    expect(again.claim.kind).toBe('alreadyClaimed');
    expect(again.state).toBe(next);
  });
});

describe('VIP daily bonus', () => {
  const fields = { lastVipClaimDate: null, lastSeenAt: NOW - 1000 };

  it('is claimable once per day by VIPs only', () => {
    expect(canClaimVipBonus({ lastVipClaimDate: null }, TODAY, false)).toBe(false);
    expect(canClaimVipBonus({ lastVipClaimDate: null }, TODAY, true)).toBe(true);
    expect(canClaimVipBonus({ lastVipClaimDate: TODAY }, TODAY, true)).toBe(false);
    expect(canClaimVipBonus({ lastVipClaimDate: '2026-11-23' }, TODAY, true)).toBe(true);
    expect(canClaimVipBonus({ lastVipClaimDate: '2026-11-25' }, TODAY, true)).toBe(false);
  });

  it('grants vipDailyCoins and vipDailyHints, not multiplied', () => {
    const claim = claimVipBonus(fields, { today: TODAY, now: NOW, isVip: true });
    expect(claim).toEqual({
      kind: 'granted',
      reward: { coins: ECONOMY.vipDailyCoins, hints: ECONOMY.vipDailyHints },
      state: { lastVipClaimDate: TODAY, lastSeenAt: NOW },
    });
  });

  it('refuses non-VIP, a second claim and clock rollback', () => {
    expect(claimVipBonus(fields, { today: TODAY, now: NOW, isVip: false }).kind).toBe('notVip');
    expect(
      claimVipBonus({ ...fields, lastVipClaimDate: TODAY }, { today: TODAY, now: NOW, isVip: true })
        .kind,
    ).toBe('alreadyClaimed');
    expect(
      claimVipBonus({ ...fields, lastSeenAt: NOW + 1 }, { today: TODAY, now: NOW, isVip: true })
        .kind,
    ).toBe('clockRollback');
    expect(
      claimVipBonus(
        { ...fields, lastVipClaimDate: '2026-11-30' },
        { today: TODAY, now: NOW, isVip: true },
      ).kind,
    ).toBe('clockRollback');
  });

  it('applyClaimVipBonus grants through the store reducer', () => {
    const state = {
      ...createDefaultProgress(NOW),
      lastSeenAt: 0,
      entitlements: { noAds: false, vip: true },
    };
    const { state: next } = applyClaimVipBonus(state, TODAY, NOW);
    expect(next).toMatchObject({ coins: 200, hints: 6, lastVipClaimDate: TODAY });
    expect(
      applyClaimVipBonus({ ...state, entitlements: { noAds: false, vip: false } }, TODAY, NOW).claim
        .kind,
    ).toBe('notVip');
  });
});
