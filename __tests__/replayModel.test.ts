import { ECONOMY } from '@/config/economy';
import { replayReward, starBonus } from '@/game/economy';
import {
  createSession,
  encodeSession,
  enterReplay,
  leaveReplay,
  mainSlots,
  restoreSlots,
  selectDailySlot,
  selectLevelSlot,
  useGameStore,
  type PersistedGame,
} from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { applyCompleteLevel, applyCompleteReplay } from '@/state/progressReducers';

import { almostWon, levelOf } from '../test-utils/boards';

const NOW = 1_000_000;

const levelSession = (n = 7) => createSession(levelOf(n, almostWon()), 'level', NOW);
const dailySession = () =>
  createSession({ ...levelOf(0, almostWon()), id: 'daily-2026-11-24' }, 'daily', NOW);
const replaySession = (n = 2) => createSession(levelOf(n, almostWon()), 'replay', NOW);

describe('replayReward', () => {
  it('pays only the star bonus the player had not earned yet', () => {
    expect(replayReward({ previousStars: 1, stars: 3, hard: false, isVip: false })).toBe(
      ECONOMY.winBonus3Star,
    );
    expect(replayReward({ previousStars: 2, stars: 3, hard: false, isVip: false })).toBe(
      ECONOMY.winBonus3Star - ECONOMY.winBonus2Star,
    );
    expect(replayReward({ previousStars: 1, stars: 2, hard: false, isVip: false })).toBe(
      ECONOMY.winBonus2Star,
    );
  });

  it('applies the hard-level and VIP multipliers but never the base win coins', () => {
    const bonus = starBonus(3);
    expect(replayReward({ previousStars: 1, stars: 3, hard: true, isVip: false })).toBe(
      bonus * ECONOMY.hardLevelMultiplier,
    );
    expect(replayReward({ previousStars: 1, stars: 3, hard: false, isVip: true })).toBe(
      bonus * ECONOMY.vipMultiplier,
    );
    expect(replayReward({ previousStars: 1, stars: 3, hard: true, isVip: true })).toBe(
      bonus * ECONOMY.hardLevelMultiplier * ECONOMY.vipMultiplier,
    );
  });

  it('pays nothing when the best is matched or not beaten', () => {
    expect(replayReward({ previousStars: 3, stars: 3, hard: true, isVip: true })).toBe(0);
    expect(replayReward({ previousStars: 2, stars: 1, hard: false, isVip: false })).toBe(0);
    expect(replayReward({ previousStars: 2, stars: 2, hard: false, isVip: false })).toBe(0);
  });

  it('counts a missing best as no stars', () => {
    expect(replayReward({ previousStars: null, stars: 3, hard: false, isVip: false })).toBe(
      starBonus(3),
    );
    expect(replayReward({ previousStars: null, stars: 1, hard: false, isVip: false })).toBe(0);
  });
});

describe('replay slots', () => {
  it('stashes both real slots untouched and pauses the active one', () => {
    const level = levelSession();
    const daily = dailySession();
    const replay = replaySession();
    const next = enterReplay({ session: daily, parked: level, stashed: null }, replay, NOW + 5);
    expect(next.session).toBe(replay);
    expect(next.parked).toBeNull();
    expect(next.stashed?.parked).toBe(level);
    expect(next.stashed?.session).toMatchObject({ levelId: daily.levelId, status: 'paused' });
    expect(mainSlots(next)).toBe(next.stashed);
  });

  it('a replay replaces a replay and keeps the existing stash', () => {
    const level = levelSession();
    const first = enterReplay(
      { session: level, parked: null, stashed: null },
      replaySession(2),
      NOW,
    );
    const second = replaySession(3);
    const next = enterReplay(first, second, NOW + 10);
    expect(next.session).toBe(second);
    expect(next.stashed?.session).toBe(first.stashed?.session);
    expect(next.stashed?.parked).toBeNull();
  });

  it('leaving brings the stashed slots back and is a no-op outside a replay', () => {
    const level = levelSession();
    const daily = dailySession();
    const inReplay = enterReplay(
      { session: level, parked: daily, stashed: null },
      replaySession(),
      NOW,
    );
    const left = leaveReplay(inReplay);
    expect(left.session).toMatchObject({ levelId: level.levelId, status: 'paused' });
    expect(left.parked).toBe(daily);
    expect(left.stashed).toBeNull();
    const plain = { session: level, parked: daily, stashed: null };
    expect(leaveReplay(plain)).toBe(plain);
    expect(mainSlots(plain)).toBe(plain);
  });

  it('a finished level is not kept when a replay starts', () => {
    const won = { ...levelSession(), status: 'won' as const };
    const next = enterReplay({ session: won, parked: null, stashed: null }, replaySession(), NOW);
    expect(next.stashed).toEqual({ session: null, parked: null });
  });

  it('a replay session is never encoded for resume', () => {
    expect(encodeSession(replaySession(), NOW)).toBeNull();
  });
});

describe('game store during a replay', () => {
  beforeEach(() => {
    useGameStore.getState().clearAll();
  });

  const partialize = (): PersistedGame => {
    const options = useGameStore.persist.getOptions();
    return options.partialize?.(useGameStore.getState()) as PersistedGame;
  };

  it('persists only the real slots, which restore to the same games', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(7, almostWon()), 'level', NOW);
    store.loadLevel({ ...levelOf(0, almostWon()), id: 'daily-2026-11-24' }, 'daily', NOW);
    store.loadLevel(levelOf(2, almostWon()), 'replay', NOW + 1);
    expect(useGameStore.getState().session?.mode).toBe('replay');
    const persisted = partialize();
    expect(persisted.snapshot?.mode).toBe('daily');
    expect(persisted.parked?.mode).toBe('level');
    const restored = restoreSlots(JSON.parse(JSON.stringify(persisted)));
    expect(restored.session?.levelId).toBe('daily-2026-11-24');
    expect(restored.parked?.levelId).toBe('level-7');
  });

  it('slot selectors see through the replay to the stash', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(7, almostWon()), 'level', NOW);
    store.loadLevel(levelOf(2, almostWon()), 'replay', NOW + 1);
    const state = useGameStore.getState();
    expect(selectLevelSlot(state)?.levelNumber).toBe(7);
    expect(selectDailySlot(state)).toBeNull();
  });

  it('exitReplay, switchTo and a non-replay load all end the replay', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(7, almostWon()), 'level', NOW);
    store.loadLevel(levelOf(2, almostWon()), 'replay', NOW + 1);
    useGameStore.getState().exitReplay();
    expect(useGameStore.getState()).toMatchObject({ stashed: null });
    expect(useGameStore.getState().session?.levelNumber).toBe(7);

    useGameStore.getState().loadLevel(levelOf(2, almostWon()), 'replay', NOW + 2);
    expect(useGameStore.getState().switchTo('level', NOW + 3)).toBe(true);
    expect(useGameStore.getState().session?.levelNumber).toBe(7);
    expect(useGameStore.getState().stashed).toBeNull();

    useGameStore.getState().loadLevel(levelOf(2, almostWon()), 'replay', NOW + 4);
    useGameStore
      .getState()
      .loadLevel({ ...levelOf(0, almostWon()), id: 'daily-2026-11-24' }, 'daily', NOW + 5);
    const state = useGameStore.getState();
    expect(state.session?.mode).toBe('daily');
    expect(state.parked?.levelNumber).toBe(7);
    expect(state.stashed).toBeNull();
  });

  it('discardStale during a replay prunes the stash, not the replay', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(7, almostWon()), 'level', NOW);
    store.loadLevel(levelOf(2, almostWon()), 'replay', NOW + 1);
    useGameStore.getState().discardStale(8);
    const state = useGameStore.getState();
    expect(state.session?.mode).toBe('replay');
    expect(state.stashed).toEqual({ session: null, parked: null });
  });
});

describe('applyCompleteReplay', () => {
  const base = {
    ...createDefaultProgress(NOW),
    level: 10,
    coins: 50,
    stars: { 2: 1 as const, 3: 3 as const },
    review: { ...createDefaultProgress(NOW).review, threeStarStreak: 2 },
  };

  it('keeps the best stars, adds the coins and leaves level and the 3★ streak alone', () => {
    const next = applyCompleteReplay(base, { level: 2, stars: 3, coins: 6 }, NOW + 1);
    expect(next).toMatchObject({ level: 10, coins: 56, updatedAt: NOW + 1 });
    expect(next.stars[2]).toBe(3);
    expect(next.review.threeStarStreak).toBe(2);
    expect(next.ads.levelsSinceInterstitial).toBe(base.ads.levelsSinceInterstitial + 1);
  });

  it('never lowers stars', () => {
    expect(applyCompleteReplay(base, { level: 3, stars: 1, coins: 0 }, NOW).stars[3]).toBe(3);
  });

  it('differs from a normal completion, which moves the level and the streak', () => {
    const normal = applyCompleteLevel(base, { level: 2, stars: 1, coins: 10 }, NOW);
    expect(normal.review.threeStarStreak).toBe(0);
    expect(applyCompleteReplay(base, { level: 2, stars: 1, coins: 0 }, NOW).review).toEqual(
      base.review,
    );
  });
});
