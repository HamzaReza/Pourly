/**
 * Pure economy rules (spec §11): win rewards, power-up cost resolution and skip eligibility.
 * Every number comes from `ECONOMY`; the UI renders the typed decisions these return.
 */
import { ECONOMY, type RewardBundle } from '@/config/economy';
import type { StarCount } from '@/state/progressModel';

export interface WinRewardInput {
  readonly stars: StarCount;
  /** Every 10th level (crown). */
  readonly hard: boolean;
  readonly isVip: boolean;
  /** Doubled by the DOUBLE_COINS rewarded ad. */
  readonly doubled: boolean;
}

/** Star bonus on top of `winBase`: 2★ +3, 3★ +6, 1★ nothing. */
export const starBonus = (stars: StarCount): number => {
  if (stars === 3) return ECONOMY.winBonus3Star;
  if (stars === 2) return ECONOMY.winBonus2Star;
  return 0;
};

/** Coins for a win: (base + star bonus) ×2 hard, ×2 VIP, ×2 doubled by an ad. */
export const winReward = ({ stars, hard, isVip, doubled }: WinRewardInput): number => {
  let coins = ECONOMY.winBase + starBonus(stars);
  if (hard) coins *= ECONOMY.hardLevelMultiplier;
  if (isVip) coins *= ECONOMY.vipMultiplier;
  if (doubled) coins *= 2;
  return coins;
};

export interface ReplayRewardInput {
  /** Best stars before the replay (null when the level had none). */
  readonly previousStars: StarCount | null;
  readonly stars: StarCount;
  readonly hard: boolean;
  readonly isVip: boolean;
}

/**
 * Coins for a replay win: only the star bonus the player had not earned yet, with the same hard
 * and VIP multipliers as a normal win and no `winBase`. Nothing when the best is not beaten.
 * Example: 1★ → 3★ on a hard level = (6 − 0) × 2 = 12 coins; 2★ → 3★ = 6 − 3 = 3 coins.
 */
export const replayReward = ({ previousStars, stars, hard, isVip }: ReplayRewardInput): number => {
  if (previousStars !== null && stars <= previousStars) return 0;
  let coins = starBonus(stars) - (previousStars === null ? 0 : starBonus(previousStars));
  if (coins <= 0) return 0;
  if (hard) coins *= ECONOMY.hardLevelMultiplier;
  if (isVip) coins *= ECONOMY.vipMultiplier;
  return coins;
};

/** Whole, non-negative count (bad input counts as 0). */
const wholeCount = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));

/** Streak bonus of the daily challenge: `streakBonusPerDay` × streak, capped at `streakBonusCap`. */
export const streakBonus = (streak: number): number =>
  Math.min(ECONOMY.streakBonusCap, ECONOMY.streakBonusPerDay * wholeCount(streak));

export interface DailyRewardInput {
  /** The streak after today's completion. */
  readonly streak: number;
  readonly isVip: boolean;
}

/** Coins for the first daily completion of a day: (base + streak bonus), ×2 for VIP. */
export const dailyChallengeReward = ({ streak, isVip }: DailyRewardInput): number => {
  const coins = ECONOMY.dailyChallengeCoins + streakBonus(streak);
  return isVip ? coins * ECONOMY.vipMultiplier : coins;
};

/** Multiplies every item of a reward bundle (VIP and ad doubling); empty items stay absent. */
export const scaleReward = (bundle: RewardBundle, factor: number): RewardBundle => {
  const times = wholeCount(factor);
  const out: RewardBundle = {};
  if (bundle.coins !== undefined) out.coins = wholeCount(bundle.coins) * times;
  if (bundle.hints !== undefined) out.hints = wholeCount(bundle.hints) * times;
  if (bundle.undos !== undefined) out.undos = wholeCount(bundle.undos) * times;
  if (bundle.extraTubes !== undefined) out.extraTubes = wholeCount(bundle.extraTubes) * times;
  return out;
};

export const canAfford = (coins: number, cost: number): boolean =>
  Number.isFinite(coins) && cost >= 0 && coins >= cost;

/** Inventory items a power-up can draw from. */
export type InventoryItem = 'hints' | 'undos' | 'extraTubes';

export type PowerUp = 'undo' | 'hint' | 'extraTube';

/**
 * How a power-up would be paid for right now, in priority order:
 * - `free`: one of the level's free undos (undo only);
 * - `inventory`: one item from the player's inventory;
 * - `ad`: the level's one rewarded-ad +Tube (extra tube only, before coins);
 * - `coins`: the coin price, which the player can afford;
 * - `adOrShop`: nothing else works; offer a rewarded ad or the Shop;
 * - `shop`: coins are short and no ad is left (extra tube only); offer the Shop;
 * - `unavailable`: cannot be used at all (the level's extra-tube cap is reached).
 */
export type CostDecision =
  | { readonly kind: 'free'; readonly freeLeft: number }
  | { readonly kind: 'inventory'; readonly item: InventoryItem; readonly owned: number }
  | { readonly kind: 'ad' }
  | { readonly kind: 'coins'; readonly cost: number }
  | { readonly kind: 'adOrShop'; readonly cost: number }
  | { readonly kind: 'shop'; readonly cost: number }
  | { readonly kind: 'unavailable' };

export const freeUndosLeft = (undosUsed: number): number =>
  Math.max(0, ECONOMY.freeUndosPerLevel - Math.max(0, undosUsed));

const paidDecision = (
  item: InventoryItem,
  owned: number,
  coins: number,
  cost: number,
): CostDecision => {
  if (owned > 0) return { kind: 'inventory', item, owned };
  if (canAfford(coins, cost)) return { kind: 'coins', cost };
  return { kind: 'adOrShop', cost };
};

export interface UndoCostInput {
  /** Undos already taken this attempt (free and paid). */
  readonly undosUsed: number;
  /** `progress.undos`. */
  readonly inventory: number;
  readonly coins: number;
}

/** Free undos first (3 per attempt), then inventory undos, then `undoCost` coins, then an ad. */
export const resolveUndoCost = ({ undosUsed, inventory, coins }: UndoCostInput): CostDecision => {
  const freeLeft = freeUndosLeft(undosUsed);
  if (freeLeft > 0) return { kind: 'free', freeLeft };
  return paidDecision('undos', inventory, coins, ECONOMY.undoCost);
};

export interface HintCostInput {
  /** `progress.hints`. */
  readonly inventory: number;
  readonly coins: number;
}

/** Inventory hints first, then `hintCoinCost` coins, then an ad. */
export const resolveHintCost = ({ inventory, coins }: HintCostInput): CostDecision =>
  paidDecision('hints', inventory, coins, ECONOMY.hintCoinCost);

export interface ExtraTubeCostInput {
  /** Extra tubes already added on this level (across restarts and resumes). */
  readonly tubesAdded: number;
  /** The level's one rewarded-ad +Tube was already earned. */
  readonly adTubeUsed: boolean;
  /** `progress.extraTubes`. */
  readonly inventory: number;
  readonly coins: number;
}

/** Extra tubes still allowed on a level that already got `tubesAdded`. */
export const extraTubesLeft = (tubesAdded: number): number =>
  Math.max(0, ECONOMY.maxExtraTubesPerLevel - wholeCount(tubesAdded));

/**
 * Up to `maxExtraTubesPerLevel` per level: inventory extra tubes first, then the level's one
 * rewarded ad, then `extraTubeCost` coins, then the Shop (no second ad).
 */
export const resolveExtraTubeCost = ({
  tubesAdded,
  adTubeUsed,
  inventory,
  coins,
}: ExtraTubeCostInput): CostDecision => {
  if (extraTubesLeft(tubesAdded) <= 0) return { kind: 'unavailable' };
  if (inventory > 0) return { kind: 'inventory', item: 'extraTubes', owned: inventory };
  if (!adTubeUsed) return { kind: 'ad' };
  if (canAfford(coins, ECONOMY.extraTubeCost))
    return { kind: 'coins', cost: ECONOMY.extraTubeCost };
  return { kind: 'shop', cost: ECONOMY.extraTubeCost };
};

/** Restarts of the same level after which SKIP_LEVEL is offered (spec §13). */
export const SKIP_AFTER_RESTARTS = 3;
/** Time on one level after which SKIP_LEVEL is offered (spec §13). */
export const SKIP_AFTER_MS = 120_000;

export interface SkipInput {
  readonly stuck: boolean;
  readonly restartsThisLevel: number;
  /** Pause-aware time spent on the level. */
  readonly elapsedMs: number;
}

/** SKIP_LEVEL is offered when stuck, after 3 restarts, or after 2 minutes on the level. */
export const canSkip = ({ stuck, restartsThisLevel, elapsedMs }: SkipInput): boolean =>
  stuck || restartsThisLevel >= SKIP_AFTER_RESTARTS || elapsedMs >= SKIP_AFTER_MS;

/** Milliseconds until the time rule of `canSkip` opens (0 when it already has). */
export const msUntilTimedSkip = (elapsedMs: number): number =>
  Math.max(0, SKIP_AFTER_MS - Math.max(0, elapsedMs));
