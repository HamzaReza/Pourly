/**
 * Chapter gate actions (P12.7): the gate blocking progression, the coin unlock and the star
 * unlock check after a win. Rules live in `@/game/chapters`.
 */
import {
  chapterOf,
  gateOf,
  isChapterUnlocked,
  progressionGate,
  type ChapterGate,
} from '@/game/chapters';
import { track } from '@/services/analytics';

import { useProgressStore } from './progressStore';

const progress = () => useProgressStore.getState();

/** The gate blocking the player's next level right now, or null. */
export const currentProgressionGate = (): ChapterGate | null => progressionGate(progress());

/** Selector: the locked chapter blocking progression, or 0 (a number keeps re-renders cheap). */
export const selectGatedChapter = (state: Parameters<typeof progressionGate>[0]): number =>
  progressionGate(state)?.chapter ?? 0;

/** The gate of `chapter` right now (null once it is open). */
export const chapterGate = (chapter: number): ChapterGate | null => gateOf(progress(), chapter);

/** Reports that the gate dialog for `gate` opened. */
export const reportGateShown = (gate: ChapterGate): void => {
  track('chapter_gate_shown', { chapter: gate.chapter, stars: gate.stars, target: gate.target });
};

export type ChapterUnlockResult =
  | { readonly kind: 'unlocked'; readonly coins: number }
  /** Already open (stars arrived meanwhile): nothing was spent. */
  | { readonly kind: 'open' }
  | { readonly kind: 'notEnoughCoins'; readonly price: number };

/** Buys `chapter` at its current price. Only call after the player confirmed the spend. */
export const unlockChapterWithCoins = (
  chapter: number,
  now: number = Date.now(),
): ChapterUnlockResult => {
  const gate = chapterGate(chapter);
  if (gate === null) return { kind: 'open' };
  if (!progress().unlockChapter(chapter, gate.price, now)) {
    return { kind: 'notEnoughCoins', price: gate.price };
  }
  track('chapter_unlocked', { chapter, method: 'coins', coins: gate.price });
  return { kind: 'unlocked', coins: gate.price };
};

/**
 * The chapter a win just opened with stars: call with whether the chapter after `level`'s was
 * open before the win. Returns that chapter when it is open now (and reports it), else null.
 */
export const chapterOpenedByStars = (level: number, openBefore: boolean): number | null => {
  const next = chapterOf(level) + 1;
  if (openBefore || !isChapterUnlocked(progress(), next)) return null;
  track('chapter_unlocked', { chapter: next, method: 'stars', coins: 0 });
  return next;
};

/** Whether the chapter after `level`'s is open (read before a win to detect a star unlock). */
export const nextChapterOpen = (level: number): boolean =>
  isChapterUnlocked(progress(), chapterOf(level) + 1);
