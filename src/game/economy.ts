/**
 * Pure economy rules (spec §11): win rewards, power-up cost resolution and skip eligibility.
 * Every number comes from `ECONOMY`; the UI renders the typed decisions these return.
 */
import { ECONOMY } from '@/config/economy';
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

export const canAfford = (coins: number, cost: number): boolean =>
  Number.isFinite(coins) && cost >= 0 && coins >= cost;

/** Inventory items a power-up can draw from. */
export type InventoryItem = 'hints' | 'undos' | 'extraTubes';

export type PowerUp = 'undo' | 'hint' | 'extraTube';

/**
 * How a power-up would be paid for right now, in priority order:
 * - `free`: one of the level's free undos (undo only);
 * - `inventory`: one item from the player's inventory;
 * - `coins`: the coin price, which the player can afford;
 * - `adOrShop`: nothing else works; offer a rewarded ad or the Shop;
 * - `unavailable`: cannot be used at all (the extra tube was already added this attempt).
 */
export type CostDecision =
  | { readonly kind: 'free'; readonly freeLeft: number }
  | { readonly kind: 'inventory'; readonly item: InventoryItem; readonly owned: number }
  | { readonly kind: 'coins'; readonly cost: number }
  | { readonly kind: 'adOrShop'; readonly cost: number }
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
  readonly extraTubeUsed: boolean;
  /** `progress.extraTubes`. */
  readonly inventory: number;
  readonly coins: number;
}

/** Once per attempt: inventory extra tubes first, then `extraTubeCost` coins, then an ad. */
export const resolveExtraTubeCost = ({
  extraTubeUsed,
  inventory,
  coins,
}: ExtraTubeCostInput): CostDecision => {
  if (extraTubeUsed) return { kind: 'unavailable' };
  return paidDecision('extraTubes', inventory, coins, ECONOMY.extraTubeCost);
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
