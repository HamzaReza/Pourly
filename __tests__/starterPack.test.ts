import {
  countdownParts,
  isStarterPackEligible,
  STARTER_PACK_WINDOW_MS,
  starterPackRemainingMs,
  starterPackWindowToOpen,
  type StarterPackFields,
} from '@/game/starterPack';
import { createDefaultProgress } from '@/state/progressModel';
import { applyOpenStarterPackWindow } from '@/state/progressReducers';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const fields = (overrides: Partial<StarterPackFields> = {}): StarterPackFields => ({
  level: 9,
  starterPackExpiresAt: null,
  starterPackPurchased: false,
  lastSeenAt: NOW - 1000,
  ...overrides,
});

describe('starter pack window', () => {
  it('is eligible once level 8 is completed and not bought', () => {
    expect(isStarterPackEligible({ level: 8, starterPackPurchased: false })).toBe(false);
    expect(isStarterPackEligible({ level: 9, starterPackPurchased: false })).toBe(true);
    expect(isStarterPackEligible({ level: 40, starterPackPurchased: true })).toBe(false);
  });

  it('opens once for 72 hours', () => {
    expect(starterPackWindowToOpen(fields(), NOW)).toBe(NOW + STARTER_PACK_WINDOW_MS);
    expect(starterPackWindowToOpen(fields({ starterPackExpiresAt: NOW + 5 }), NOW)).toBeNull();
    expect(starterPackWindowToOpen(fields({ level: 8 }), NOW)).toBeNull();
    expect(starterPackWindowToOpen(fields({ starterPackPurchased: true }), NOW)).toBeNull();
  });

  it('a rolled-back clock opens from lastSeenAt and cannot lengthen the offer', () => {
    expect(starterPackWindowToOpen(fields({ lastSeenAt: NOW }), NOW - 3_600_000)).toBe(
      NOW + STARTER_PACK_WINDOW_MS,
    );
    const open = fields({ starterPackExpiresAt: NOW + STARTER_PACK_WINDOW_MS, lastSeenAt: NOW });
    expect(starterPackRemainingMs(open, NOW - 10 * 3_600_000)).toBe(STARTER_PACK_WINDOW_MS);
  });

  it('remaining time counts down to 0 at the boundary and hides when bought', () => {
    const open = fields({ starterPackExpiresAt: NOW + STARTER_PACK_WINDOW_MS, lastSeenAt: NOW });
    expect(starterPackRemainingMs(open, NOW + 1000)).toBe(STARTER_PACK_WINDOW_MS - 1000);
    expect(starterPackRemainingMs(open, NOW + STARTER_PACK_WINDOW_MS)).toBe(0);
    expect(starterPackRemainingMs(open, NOW + STARTER_PACK_WINDOW_MS + 1)).toBe(0);
    expect(starterPackRemainingMs({ ...open, starterPackPurchased: true }, NOW)).toBe(0);
    expect(starterPackRemainingMs(fields(), NOW)).toBe(0);
  });

  it('countdownParts rounds up to the second; hours may exceed 24', () => {
    expect(countdownParts(STARTER_PACK_WINDOW_MS)).toEqual({ hours: 72, minutes: 0, seconds: 0 });
    expect(countdownParts(3_600_000 + 61_001)).toEqual({ hours: 1, minutes: 1, seconds: 2 });
    expect(countdownParts(1)).toEqual({ hours: 0, minutes: 0, seconds: 1 });
    expect(countdownParts(-5)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('applyOpenStarterPackWindow persists once and is idempotent', () => {
    const state = { ...createDefaultProgress(NOW), level: 9, lastSeenAt: NOW };
    const opened = applyOpenStarterPackWindow(state, NOW);
    expect(opened.starterPackExpiresAt).toBe(NOW + STARTER_PACK_WINDOW_MS);
    expect(applyOpenStarterPackWindow(opened, NOW + 5000)).toBe(opened);
    const early = { ...createDefaultProgress(NOW), level: 8 };
    expect(applyOpenStarterPackWindow(early, NOW)).toBe(early);
  });
});
