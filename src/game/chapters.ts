/**
 * Chapter gates (P12.7). Pure rules; every number comes from `ECONOMY`.
 *
 * Chapter k holds levels 20(k − 1) + 1 … 20k (beyond the precomputed levels too). Chapter 1 is
 * always open. Chapter k + 1 opens once the player holds `chapterStarTarget` best stars in
 * chapter k, or paid coins for it. Best stars only go up, so a star unlock never locks again.
 * VIP has no bypass but pays 25% less for a coin unlock (P12.8). The daily challenge and replays
 * are not gated.
 */
import { ECONOMY } from '@/config/economy';
import type { StarCount } from '@/state/progressModel';

export interface ChapterOwner {
  readonly stars: Readonly<Record<number, StarCount>>;
  /** Chapters bought with coins. */
  readonly paidChapters: readonly number[];
  /** VIP pays the discounted unlock price (absent: not VIP). */
  readonly entitlements?: { readonly vip: boolean };
}

/** The chapter `level` belongs to (1-based). */
export const chapterOf = (level: number): number =>
  Math.max(1, Math.ceil(Math.max(1, Math.floor(level)) / ECONOMY.chapterSize));

/** First level of `chapter`. */
export const firstLevelOf = (chapter: number): number => (chapter - 1) * ECONOMY.chapterSize + 1;

/** Last level of `chapter`. */
export const lastLevelOf = (chapter: number): number => chapter * ECONOMY.chapterSize;

/** Best stars collected in `chapter`. */
export const starsInChapter = (
  stars: Readonly<Record<number, StarCount>>,
  chapter: number,
): number => {
  let total = 0;
  for (let level = firstLevelOf(chapter); level <= lastLevelOf(chapter); level += 1) {
    total += stars[level] ?? 0;
  }
  return total;
};

/** Whether `chapter` is open (chapter 1 always is). */
export const isChapterUnlocked = (owner: ChapterOwner, chapter: number): boolean =>
  chapter <= 1 ||
  owner.paidChapters.includes(chapter) ||
  starsInChapter(owner.stars, chapter - 1) >= ECONOMY.chapterStarTarget;

/**
 * Coins to open a chapter when the previous one holds `stars`: 10 × missing, clamped to 50…300.
 * VIP pays that × 0.75, rounded to the nearest coin (`Math.round`): 50 → 38, 60 → 45, 300 → 225.
 */
export const chapterUnlockPrice = (stars: number, isVip = false): number => {
  const missing = Math.max(0, ECONOMY.chapterStarTarget - stars);
  const price = Math.min(
    ECONOMY.chapterUnlockMax,
    Math.max(ECONOMY.chapterUnlockMin, missing * ECONOMY.chapterUnlockCoinsPerStar),
  );
  return isVip ? Math.round(price * (1 - ECONOMY.vipChapterUnlockDiscount)) : price;
};

/** A locked chapter: what the gate dialog shows. */
export interface ChapterGate {
  readonly chapter: number;
  /** Best stars in the previous chapter. */
  readonly stars: number;
  readonly target: number;
  /** What the player pays (VIP discount applied). */
  readonly price: number;
  /** The price before the VIP discount (equal to `price` for everyone else). */
  readonly fullPrice: number;
  readonly vipDiscount: boolean;
}

/** The gate of `chapter`, or null when it is open. */
export const gateOf = (owner: ChapterOwner, chapter: number): ChapterGate | null => {
  if (isChapterUnlocked(owner, chapter)) return null;
  const stars = starsInChapter(owner.stars, chapter - 1);
  const vip = owner.entitlements?.vip === true;
  return {
    chapter,
    stars,
    target: ECONOMY.chapterStarTarget,
    price: chapterUnlockPrice(stars, vip),
    fullPrice: chapterUnlockPrice(stars),
    vipDiscount: vip,
  };
};

/** The gate blocking the player's next level (`level`), or null when progression is open. */
export const progressionGate = (owner: ChapterOwner & { readonly level: number }) =>
  gateOf(owner, chapterOf(owner.level));
