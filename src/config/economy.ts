export const ECONOMY = {
  startCoins: 100,
  startHints: 3,
  startExtraTubes: 1,
  freeUndosPerLevel: 3,
  undoCost: 10,
  hintCoinCost: 25,
  extraTubeCost: 40,
  winBase: 10,
  winBonus2Star: 3,
  winBonus3Star: 6,
  hardLevelMultiplier: 2,
  dailyChallengeCoins: 40,
  streakBonusPerDay: 2,
  streakBonusCap: 20,
  dailyGiftCycle: [
    { coins: 20 },
    { hints: 1 },
    { coins: 30 },
    { undos: 2 },
    { coins: 50 },
    { hints: 2 },
    { coins: 150, hints: 3, extraTubes: 3 }, // day 7 chest
  ],
  vipMultiplier: 2,
  vipDailyCoins: 100,
  vipDailyHints: 3,
  freeCoinsAdReward: 50,
  freeCoinsAdCooldownSec: 300,
  freeCoinsAdDailyMax: 5,
  doubleCoinsOnWin: true,
  themePrices: { ember: 300, sunset: 400, forest: 500, candy: 700, neon: 1000 },
} as const;

export type Economy = typeof ECONOMY;

/** A reward bundle. Every field is optional so gift entries can grant any mix. */
export interface RewardBundle {
  coins?: number;
  hints?: number;
  undos?: number;
  extraTubes?: number;
}

export type DailyGift = Economy['dailyGiftCycle'][number];

export type PurchasableThemeId = keyof Economy['themePrices'];

export const DAILY_GIFT_CYCLE_LENGTH: number = ECONOMY.dailyGiftCycle.length;
