import {
  INTERSTITIAL_RULES,
  interstitialVerdict,
  shouldShowInterstitial,
  type InterstitialState,
} from '@/services/adScheduler';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

/** A state where every rule passes; each test breaks exactly one. */
const allowed = (overrides: Partial<InterstitialState> = {}): InterstitialState => ({
  trigger: 'next',
  mode: 'level',
  completedLevel: 9,
  skipped: false,
  entitlements: { noAds: false, vip: false },
  ads: { lastInterstitialAt: 0, lastRewardedAt: 0, levelsSinceInterstitial: 3 },
  sessionCount: 4,
  firstSessionStartedAt: NOW - 10 * HOUR,
  ...overrides,
});

const reason = (state: InterstitialState, now = NOW) => {
  const verdict = interstitialVerdict(state, now);
  return verdict.show ? 'show' : verdict.reason;
};

describe('shouldShowInterstitial', () => {
  it('shows when every rule passes', () => {
    expect(shouldShowInterstitial(allowed(), NOW)).toBe(true);
    expect(reason(allowed())).toBe('show');
  });

  it('only on Next, only in level mode and never in the stuck/skip flow', () => {
    expect(reason(allowed({ trigger: 'other' }))).toBe('notNext');
    expect(reason(allowed({ mode: 'daily' }))).toBe('daily');
    expect(reason(allowed({ skipped: true }))).toBe('stuckFlow');
  });

  it('never for VIP or no_ads', () => {
    expect(reason(allowed({ entitlements: { noAds: true, vip: false } }))).toBe('adFree');
    expect(reason(allowed({ entitlements: { noAds: false, vip: true } }))).toBe('adFree');
  });

  it('never after a level below 6', () => {
    expect(INTERSTITIAL_RULES.minLevel).toBe(6);
    expect(reason(allowed({ completedLevel: 5 }))).toBe('tooEarlyLevel');
    expect(reason(allowed({ completedLevel: 0 }))).toBe('tooEarlyLevel');
    expect(reason(allowed({ completedLevel: 6 }))).toBe('show');
  });

  it('every 3rd completed level', () => {
    const ads = allowed().ads;
    expect(reason(allowed({ ads: { ...ads, levelsSinceInterstitial: 2 } }))).toBe('cadence');
    expect(reason(allowed({ ads: { ...ads, levelsSinceInterstitial: 3 } }))).toBe('show');
    expect(reason(allowed({ ads: { ...ads, levelsSinceInterstitial: 7 } }))).toBe('show');
  });

  it('at least 120 s after the last interstitial', () => {
    const ads = { ...allowed().ads, lastInterstitialAt: NOW };
    expect(reason(allowed({ ads }), NOW + 119_999)).toBe('recentInterstitial');
    expect(reason(allowed({ ads }), NOW + 120_000)).toBe('show');
  });

  it('at least 60 s after the last rewarded ad', () => {
    const ads = { ...allowed().ads, lastRewardedAt: NOW };
    expect(reason(allowed({ ads }), NOW + 59_999)).toBe('recentRewarded');
    expect(reason(allowed({ ads }), NOW + 60_000)).toBe('show');
  });

  it('treats a clock turned back as too recent', () => {
    const ads = { ...allowed().ads, lastInterstitialAt: NOW, lastRewardedAt: 0 };
    expect(reason(allowed({ ads }), NOW - HOUR)).toBe('recentInterstitial');
    const rewarded = { ...allowed().ads, lastRewardedAt: NOW };
    expect(reason(allowed({ ads: rewarded }), NOW - 1)).toBe('recentRewarded');
  });

  it('never in the first 5 minutes of the very first session', () => {
    const first = allowed({ sessionCount: 1, firstSessionStartedAt: NOW });
    expect(reason(first, NOW + 4 * 60_000 + 59_999)).toBe('firstSession');
    expect(reason(first, NOW + 5 * 60_000)).toBe('show');
    expect(reason(first, NOW - 1)).toBe('firstSession');
    expect(reason(allowed({ sessionCount: 0, firstSessionStartedAt: NOW }), NOW)).toBe(
      'firstSession',
    );
    expect(reason(allowed({ sessionCount: 2, firstSessionStartedAt: NOW }), NOW + 1000)).toBe(
      'show',
    );
  });
});
