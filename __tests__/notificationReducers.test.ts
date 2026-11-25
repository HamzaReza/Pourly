import {
  applyNotificationPermission,
  applyNotificationPromptResult,
  applyNotificationToggle,
  applyReviewPrompted,
  applyTouchForeground,
} from '@/state/progressReducers';
import { createDefaultProgress } from '@/state/progressModel';

const NOW = new Date(2026, 10, 25, 12, 0).getTime();
const base = () => createDefaultProgress(NOW - 10_000);

describe('notification and review reducers', () => {
  it('touchForeground moves lastOpenAt without counting a session', () => {
    const state = { ...base(), sessionCount: 4 };
    const next = applyTouchForeground(state, NOW);
    expect(next).toMatchObject({
      lastOpenAt: NOW,
      lastSeenAt: NOW,
      sessionCount: 4,
      updatedAt: NOW,
    });
  });

  it('touchForeground never moves lastSeenAt backwards', () => {
    const state = { ...base(), lastSeenAt: NOW + 5_000, updatedAt: NOW + 5_000 };
    const next = applyTouchForeground(state, NOW);
    expect(next).toMatchObject({
      lastOpenAt: NOW,
      lastSeenAt: NOW + 5_000,
      updatedAt: NOW + 5_000,
    });
  });

  it('a prompt answer counts one ask and stores the result', () => {
    const once = applyNotificationPromptResult(base(), false, NOW);
    expect(once.notifications).toMatchObject({ asked: true, askedCount: 1, granted: false });
    const twice = applyNotificationPromptResult(once, true, NOW);
    expect(twice.notifications).toMatchObject({ asked: true, askedCount: 2, granted: true });
    expect(twice.updatedAt).toBe(NOW);
  });

  it('permission sync returns the same state when nothing changed', () => {
    const state = base();
    expect(applyNotificationPermission(state, false, NOW)).toBe(state);
    const granted = applyNotificationPermission(state, true, NOW);
    expect(granted.notifications.granted).toBe(true);
    expect(applyNotificationPermission(granted, false, NOW).notifications.granted).toBe(false);
  });

  it('toggles change only their own flag', () => {
    const state = base();
    expect(applyNotificationToggle(state, 'dailyEnabled', true, NOW)).toBe(state);
    const off = applyNotificationToggle(state, 'streakEnabled', false, NOW);
    expect(off.notifications).toMatchObject({ dailyEnabled: true, streakEnabled: false });
    expect(off.updatedAt).toBe(NOW);
  });

  it('a review prompt stamps the time and counts it, keeping the 3★ run', () => {
    const state = { ...base(), review: { lastPromptAt: 0, promptCount: 1, threeStarStreak: 3 } };
    expect(applyReviewPrompted(state, NOW).review).toEqual({
      lastPromptAt: NOW,
      promptCount: 2,
      threeStarStreak: 3,
    });
  });
});
