import { ECONOMY } from '@/config/economy';
import {
  chapterOf,
  chapterUnlockPrice,
  firstLevelOf,
  gateOf,
  isChapterUnlocked,
  lastLevelOf,
  progressionGate,
  starsInChapter,
} from '@/game/chapters';
import { track } from '@/services/analytics';
import {
  cloudFingerprint,
  mergeProgress,
  parseCloudSnapshot,
  pickCloudProgress,
} from '@/services/cloudMerge';
import { unlockChapterWithCoins } from '@/state/chapterFlow';
import { commitPlayerPour, ensureLevelSession, onNextPressed } from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { migrateProgress, sanitizeChapters } from '@/state/migrations';
import { createDefaultProgress, type StarCount } from '@/state/progressModel';
import { applyUnlockChapter } from '@/state/progressReducers';
import { useProgressStore } from '@/state/progressStore';

import { almostWon, levelOf } from '../test-utils/boards';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(() => Promise.resolve(false)),
    preload: jest.fn(),
  },
}));
jest.mock('@/state/levelLoader', () => {
  const actual = jest.requireActual('@/state/levelLoader');
  return { ...actual, prepareLevel: jest.fn(() => new Promise(() => undefined)) };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const trackMock = track as jest.Mock;

/** Best stars `value` on every level from `from` to `to`. */
const starsFor = (from: number, to: number, value: StarCount): Record<number, StarCount> => {
  const out: Record<number, StarCount> = {};
  for (let level = from; level <= to; level += 1) out[level] = value;
  return out;
};

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.getState().clearAll();
});

describe('chapter rules', () => {
  it('groups levels in chapters of 20, past the precomputed levels too', () => {
    expect(ECONOMY.chapterSize).toBe(20);
    expect([chapterOf(1), chapterOf(20), chapterOf(21), chapterOf(40), chapterOf(301)]).toEqual([
      1, 1, 2, 2, 16,
    ]);
    expect([firstLevelOf(3), lastLevelOf(3)]).toEqual([41, 60]);
    expect(chapterOf(0)).toBe(1);
  });

  it('sums best stars inside one chapter only', () => {
    const stars = { ...starsFor(1, 20, 2), 21: 3 as const };
    expect(starsInChapter(stars, 1)).toBe(40);
    expect(starsInChapter(stars, 2)).toBe(3);
  });

  it('opens a chapter at 40 stars in the previous one, or when paid; chapter 1 always', () => {
    const owner = (stars: Record<number, StarCount>, paidChapters: number[] = []) => ({
      stars,
      paidChapters,
    });
    expect(isChapterUnlocked(owner({}), 1)).toBe(true);
    expect(isChapterUnlocked(owner({ ...starsFor(1, 19, 2), 20: 1 }), 2)).toBe(false); // 39
    expect(isChapterUnlocked(owner(starsFor(1, 20, 2)), 2)).toBe(true); // 40
    expect(isChapterUnlocked(owner({}, [2]), 2)).toBe(true);
    // Stars in chapter 1 do not open chapter 3.
    expect(isChapterUnlocked(owner(starsFor(1, 20, 3), [2]), 3)).toBe(false);
  });

  it('prices 10 coins per missing star, clamped to 50–300', () => {
    expect(chapterUnlockPrice(34)).toBe(60);
    expect(chapterUnlockPrice(39)).toBe(ECONOMY.chapterUnlockMin);
    expect(chapterUnlockPrice(0)).toBe(ECONOMY.chapterUnlockMax);
    expect(chapterUnlockPrice(15)).toBe(250);
    expect(chapterUnlockPrice(45)).toBe(ECONOMY.chapterUnlockMin);
  });

  it('describes a gate, and none for open chapters', () => {
    const stars = { ...starsFor(1, 17, 2) }; // 34
    expect(gateOf({ stars, paidChapters: [] }, 2)).toEqual({
      chapter: 2,
      stars: 34,
      target: 40,
      price: 60,
    });
    expect(gateOf({ stars, paidChapters: [] }, 1)).toBeNull();
    expect(gateOf({ stars, paidChapters: [2] }, 2)).toBeNull();
  });

  it('blocks progression only when the next level is in a locked chapter', () => {
    const stars = starsFor(1, 20, 1); // 20
    expect(progressionGate({ stars, paidChapters: [], level: 20 })).toBeNull();
    expect(progressionGate({ stars, paidChapters: [], level: 21 })?.chapter).toBe(2);
    expect(progressionGate({ stars, paidChapters: [], level: 35 })?.chapter).toBe(2);
    expect(progressionGate({ stars, paidChapters: [2], level: 21 })).toBeNull();
  });
});

describe('persistence', () => {
  it('v2 progress migrates to v3 with no paid chapters', () => {
    const migrated = migrateProgress({ level: 30, stars: { 1: 3 } }, 2, NOW);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.paidChapters).toEqual([]);
    expect(createDefaultProgress(NOW).paidChapters).toEqual([]);
  });

  it('keeps only unique whole chapters from 2 up, sorted', () => {
    expect(sanitizeChapters([5, 2, 2, 1, 0, -3, 2.5, '3', null, 4])).toEqual([2, 4, 5]);
    expect(sanitizeChapters('2')).toEqual([]);
    expect(migrateProgress({ paidChapters: [3, 2] }, 3, NOW).paidChapters).toEqual([2, 3]);
  });

  it('applyUnlockChapter spends the coins once and refuses bad requests', () => {
    const base = { ...createDefaultProgress(NOW), coins: 100 };
    const next = applyUnlockChapter(base, 3, 60, NOW + 1);
    expect(next).toMatchObject({ coins: 40, paidChapters: [3], updatedAt: NOW + 1 });
    expect(applyUnlockChapter(next!, 3, 10, NOW)).toBeNull(); // already paid
    expect(applyUnlockChapter(base, 2, 150, NOW)).toBeNull(); // too expensive
    expect(applyUnlockChapter(base, 1, 0, NOW)).toBeNull(); // chapter 1 is free
    expect(applyUnlockChapter(base, 2, -5, NOW)).toBeNull();
  });
});

describe('cloud save', () => {
  const cloud = (paidChapters: number[]) => ({
    ...pickCloudProgress(createDefaultProgress(NOW)),
    paidChapters,
  });

  it('merges paid chapters as a union', () => {
    expect(mergeProgress(cloud([2, 4]), cloud([3, 4]), null).progress.paidChapters).toEqual([
      2, 3, 4,
    ]);
    expect(mergeProgress(cloud([2]), null, null).progress.paidChapters).toEqual([2]);
  });

  it('parses documents with or without the field', () => {
    const doc = { ...cloud([3]), schemaVersion: 1 };
    expect(parseCloudSnapshot(doc)?.paidChapters).toEqual([3]);
    const { paidChapters: _omit, ...older } = doc;
    expect(parseCloudSnapshot(older)?.paidChapters).toEqual([]);
    expect(parseCloudSnapshot({ ...doc, paidChapters: [1, 'x', 2] })?.paidChapters).toEqual([2]);
  });

  it('a paid chapter changes the fingerprint and is picked from progress', () => {
    expect(cloudFingerprint(cloud([]))).not.toBe(cloudFingerprint(cloud([2])));
    expect(
      pickCloudProgress({ ...createDefaultProgress(NOW), paidChapters: [2] }).paidChapters,
    ).toEqual([2]);
  });

  it('applying the merged copy keeps the paid chapters', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), paidChapters: [2] });
    const merged = mergeProgress(cloud([2]), cloud([5]), null);
    useProgressStore.getState().applyCloudProgress(merged.progress, merged.baseline, NOW);
    expect(useProgressStore.getState().paidChapters).toEqual([2, 5]);
  });
});

describe('unlockChapterWithCoins', () => {
  it('spends the current price and reports the unlock', () => {
    useProgressStore.setState({
      ...createDefaultProgress(NOW),
      level: 21,
      coins: 500,
      stars: starsFor(1, 17, 2), // 34 → 60 coins
    });
    expect(unlockChapterWithCoins(2, NOW)).toEqual({ kind: 'unlocked', coins: 60 });
    expect(useProgressStore.getState()).toMatchObject({ coins: 440, paidChapters: [2] });
    expect(trackMock).toHaveBeenCalledWith('chapter_unlocked', {
      chapter: 2,
      method: 'coins',
      coins: 60,
    });
  });

  it('refuses when coins are short and spends nothing', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), level: 21, coins: 10 });
    expect(unlockChapterWithCoins(2, NOW)).toEqual({ kind: 'notEnoughCoins', price: 300 });
    expect(useProgressStore.getState()).toMatchObject({ coins: 10, paidChapters: [] });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('spends nothing on a chapter that is already open', () => {
    useProgressStore.setState({
      ...createDefaultProgress(NOW),
      coins: 500,
      stars: starsFor(1, 20, 2),
    });
    expect(unlockChapterWithCoins(2, NOW)).toEqual({ kind: 'open' });
    expect(useProgressStore.getState().coins).toBe(500);
  });
});

describe('progression gating in the game flow', () => {
  it('a locked chapter refuses to start or resume its levels and Next', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), level: 21, stars: { 1: 3 } });
    expect(ensureLevelSession(NOW)).toBeNull();
    expect(useGameStore.getState().session).toBeNull();
    expect(onNextPressed(NOW)).toBeNull();
    expect(useGameStore.getState().session).toBeNull();
  });

  it('a saved game inside a locked chapter is not resumed', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), level: 25, stars: { 1: 3 } });
    useGameStore.getState().loadLevel(levelOf(25, almostWon()), 'level', NOW);
    useGameStore.getState().pause(NOW);
    ensureLevelSession(NOW + 1);
    expect(useGameStore.getState().session?.status).toBe('paused');
    expect(trackMock).not.toHaveBeenCalledWith('level_start', expect.anything());
  });

  it('a win whose stars reach 40 opens the next chapter and says so', () => {
    useProgressStore.setState({
      ...createDefaultProgress(NOW),
      level: 20,
      tutorialDone: true,
      stars: starsFor(1, 19, 2), // 38, level 20 still to play
    });
    useGameStore.getState().loadLevel(levelOf(20, almostWon()), 'level', NOW);
    commitPlayerPour(1, 0, NOW + 1000);
    const result = useGameStore.getState().session?.result;
    expect(result).toMatchObject({ stars: 3, chapterUnlocked: 2 });
    expect(trackMock).toHaveBeenCalledWith('chapter_unlocked', {
      chapter: 2,
      method: 'stars',
      coins: 0,
    });
    expect(ensureLevelSession(NOW + 2000)).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(21);
  });

  it('a win that does not reach 40 leaves the next chapter locked', () => {
    useProgressStore.setState({
      ...createDefaultProgress(NOW),
      level: 20,
      tutorialDone: true,
      stars: starsFor(1, 19, 1), // 19 + 3 = 22
    });
    useGameStore.getState().loadLevel(levelOf(20, almostWon()), 'level', NOW);
    commitPlayerPour(1, 0, NOW + 1000);
    expect(useGameStore.getState().session?.result?.chapterUnlocked).toBeUndefined();
    expect(useProgressStore.getState().level).toBe(21);
    expect(onNextPressed(NOW + 2000)).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(20);
  });

  it('a replay that lifts the chapter to 40 stars opens the next one', () => {
    useProgressStore.setState({
      ...createDefaultProgress(NOW),
      level: 21,
      stars: { ...starsFor(1, 19, 2), 20: 1 }, // 39
    });
    useGameStore.getState().loadLevel(levelOf(20, almostWon()), 'replay', NOW);
    commitPlayerPour(1, 0, NOW + 1000);
    expect(useGameStore.getState().session?.result?.chapterUnlocked).toBe(2);
  });

  it('the daily challenge is never gated', () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), level: 21, stars: {} });
    useGameStore
      .getState()
      .loadLevel({ ...levelOf(0, almostWon()), id: 'daily-2026-11-24' }, 'daily', NOW);
    commitPlayerPour(1, 0, NOW + 1000);
    const session = useGameStore.getState().session;
    expect(session?.status).toBe('won');
    expect(session?.result?.chapterUnlocked).toBeUndefined();
    expect(trackMock).not.toHaveBeenCalledWith('chapter_unlocked', expect.anything());
  });
});
