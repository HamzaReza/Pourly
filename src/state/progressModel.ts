import { ECONOMY } from '@/config/economy';
import { localDateString } from '@/utils/date';

export const PROGRESS_VERSION = 1;

export const DEFAULT_THEME_ID = 'classic';

export const MAX_PROCESSED_TRANSACTIONS = 200;

export type StarCount = 1 | 2 | 3;

export interface Balances {
  coins: number;
  hints: number;
  undos: number;
  extraTubes: number;
}

export interface DailyResult {
  stars: number;
  moves: number;
}

export interface AdsProgress {
  lastInterstitialAt: number;
  lastRewardedAt: number;
  levelsSinceInterstitial: number;
  freeCoinsClaimsToday: number;
  freeCoinsDate: string | null;
  lastFreeCoinsAt: number;
}

export interface NotificationsProgress {
  asked: boolean;
  askedCount: number;
  granted: boolean;
  dailyEnabled: boolean;
  streakEnabled: boolean;
}

export interface ReviewProgress {
  lastPromptAt: number;
  promptCount: number;
  threeStarStreak: number;
}

export interface ProgressState extends Balances {
  schemaVersion: number;
  installDate: string;
  lastOpenAt: number;
  lastSeenAt: number;
  sessionCount: number;
  /** Next level to play. */
  level: number;
  stars: Record<number, StarCount>;
  streak: number;
  bestStreak: number;
  lastDailyDate: string | null;
  dailyHistory: Record<string, DailyResult>;
  giftDayIndex: number;
  lastGiftDate: string | null;
  lastVipClaimDate: string | null;
  streakFreezeWeek: string | null;
  ownedThemes: string[];
  activeTheme: string;
  entitlements: { noAds: boolean; vip: boolean };
  /** Last 200 store transaction ids already granted. */
  processedTransactions: string[];
  starterPackExpiresAt: number | null;
  starterPackPurchased: boolean;
  ads: AdsProgress;
  notifications: NotificationsProgress;
  review: ReviewProgress;
  tutorialDone: boolean;
  /** Balances at the last successful cloud sync; null until the first sync. */
  lastSyncedBalances: Balances | null;
  /** Epoch ms of the last local change, used by cloud-save merging. */
  updatedAt: number;
}

export const createDefaultProgress = (now: number): ProgressState => ({
  schemaVersion: PROGRESS_VERSION,
  installDate: localDateString(new Date(now)),
  lastOpenAt: now,
  lastSeenAt: now,
  sessionCount: 0,
  level: 1,
  stars: {},
  coins: ECONOMY.startCoins,
  hints: ECONOMY.startHints,
  undos: 0,
  extraTubes: ECONOMY.startExtraTubes,
  streak: 0,
  bestStreak: 0,
  lastDailyDate: null,
  dailyHistory: {},
  giftDayIndex: 0,
  lastGiftDate: null,
  lastVipClaimDate: null,
  streakFreezeWeek: null,
  ownedThemes: [DEFAULT_THEME_ID],
  activeTheme: DEFAULT_THEME_ID,
  entitlements: { noAds: false, vip: false },
  processedTransactions: [],
  starterPackExpiresAt: null,
  starterPackPurchased: false,
  ads: {
    lastInterstitialAt: 0,
    lastRewardedAt: 0,
    levelsSinceInterstitial: 0,
    freeCoinsClaimsToday: 0,
    freeCoinsDate: null,
    lastFreeCoinsAt: 0,
  },
  notifications: {
    asked: false,
    askedCount: 0,
    granted: false,
    dailyEnabled: true,
    streakEnabled: true,
  },
  review: { lastPromptAt: 0, promptCount: 0, threeStarStreak: 0 },
  tutorialDone: false,
  lastSyncedBalances: null,
  updatedAt: now,
});
