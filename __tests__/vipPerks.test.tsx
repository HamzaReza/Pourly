import { fireEvent, render, screen } from '@testing-library/react-native';

import { ECONOMY } from '@/config/economy';
import { chapterUnlockPrice, gateOf } from '@/game/chapters';
import { resolveExtraTubeCost } from '@/game/economy';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { unlockChapterWithCoins } from '@/state/chapterFlow';
import { activatePowerUp, costOf } from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type StarCount } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { ActionBar } from '@/ui/game/ActionBar';
import { ChapterGateOverlay } from '@/ui/game/overlays/ChapterGateOverlay';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { VipCard } from '@/ui/shop/VipCard';

import { almostWon, levelOf } from '../test-utils/boards';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
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
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const ui = getTheme('classic').ui;
const trackMock = track as jest.Mock;
const showRewarded = ads.showRewarded as jest.Mock;

const starsFor = (from: number, to: number, value: StarCount): Record<number, StarCount> => {
  const out: Record<number, StarCount> = {};
  for (let level = from; level <= to; level += 1) out[level] = value;
  return out;
};

const setVip = (vip: boolean, overrides = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    extraTubes: 0,
    coins: 500,
    entitlements: { noAds: false, vip },
    ...overrides,
  });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.getState().clearAll();
});

describe('VIP free +Tube (no ad)', () => {
  const base = { tubesAdded: 0, adTubeUsed: false, inventory: 0, coins: 500 };

  it('the level ad tube becomes a VIP tube; stock still comes first and the order is unchanged', () => {
    expect(resolveExtraTubeCost({ ...base, isVip: true })).toEqual({ kind: 'vipTube' });
    expect(resolveExtraTubeCost({ ...base, isVip: false })).toEqual({ kind: 'ad' });
    expect(resolveExtraTubeCost({ ...base, inventory: 2, isVip: true }).kind).toBe('inventory');
    expect(resolveExtraTubeCost({ ...base, adTubeUsed: true, isVip: true })).toEqual({
      kind: 'coins',
      cost: ECONOMY.extraTubeCost,
    });
    expect(resolveExtraTubeCost({ ...base, tubesAdded: 2, isVip: true }).kind).toBe('unavailable');
  });

  it('a VIP gets the tube at once, without an ad, counted as the level ad tube', () => {
    setVip(true);
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    expect(costOf('extraTube')).toEqual({ kind: 'vipTube' });
    expect(activatePowerUp('extraTube', null, NOW)).toEqual({ kind: 'applied', source: 'vip' });
    expect(showRewarded).not.toHaveBeenCalled();
    expect(useGameStore.getState().session).toMatchObject({ extraTubesAdded: 1, adTubeUsed: true });
    expect(trackMock).toHaveBeenCalledWith('extra_tube_used', { level: 5, source: 'vip' });
    expect(useProgressStore.getState().coins).toBe(500);
    // The second +Tube follows the normal order: coins.
    expect(costOf('extraTube')).toEqual({ kind: 'coins', cost: ECONOMY.extraTubeCost });
  });

  it('a non-VIP still needs the ad', () => {
    setVip(false);
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    expect(activatePowerUp('extraTube', null, NOW)).toEqual({
      kind: 'needsAd',
      powerUp: 'extraTube',
    });
    expect(useGameStore.getState().session?.extraTubesAdded).toBe(0);
  });

  it('VIP expiring mid-level falls back to the ad', () => {
    setVip(true);
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    expect(costOf('extraTube').kind).toBe('vipTube');
    useProgressStore.setState({ entitlements: { noAds: false, vip: false } });
    expect(costOf('extraTube').kind).toBe('ad');
    expect(activatePowerUp('extraTube', null, NOW).kind).toBe('needsAd');
  });

  it('the action bar describes the +Tube as free with VIP', async () => {
    setVip(true);
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    await render(
      <ActionBar
        ui={ui}
        onUndo={jest.fn()}
        onHint={jest.fn()}
        onRestart={jest.fn()}
        onAddTube={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('+Tube, free with VIP')).toBeTruthy();
  });

  it('the Stuck card shows the free VIP tube, without the ad icon', async () => {
    const onAddTube = jest.fn();
    await render(
      <StuckOverlay
        ui={ui}
        canUndo={false}
        tubeCost={{ kind: 'vipTube' }}
        busy={false}
        onUndo={jest.fn()}
        onAddTube={onAddTube}
        onRestart={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const button = screen.getByTestId('stuck-add-tube');
    expect(screen.getByText('Free +1 Tube · VIP')).toBeTruthy();
    expect(button.props.accessibilityLabel).toBe('Free +1 Tube · VIP');
    await fireEvent.press(button);
    expect(onAddTube).toHaveBeenCalledTimes(1);
  });
});

describe('VIP chapter discount', () => {
  it('is 25% off, rounded to the nearest coin, after the 50–300 clamp', () => {
    expect(ECONOMY.vipChapterUnlockDiscount).toBe(0.25);
    expect(chapterUnlockPrice(34, true)).toBe(45); // 60 × 0.75
    expect(chapterUnlockPrice(39, true)).toBe(38); // 50 × 0.75 = 37.5 → 38
    expect(chapterUnlockPrice(0, true)).toBe(225); // 300 × 0.75
    expect(chapterUnlockPrice(27, true)).toBe(98); // 130 × 0.75 = 97.5 → 98
    expect(chapterUnlockPrice(34, false)).toBe(60);
  });

  it('the gate carries both prices; the star rule is the same for VIP', () => {
    const stars = starsFor(1, 17, 2); // 34
    expect(gateOf({ stars, paidChapters: [], entitlements: { vip: true } }, 2)).toEqual({
      chapter: 2,
      stars: 34,
      target: 40,
      price: 45,
      fullPrice: 60,
      vipDiscount: true,
    });
    expect(
      gateOf({ stars: starsFor(1, 20, 2), paidChapters: [], entitlements: { vip: true } }, 2),
    ).toBeNull();
    expect(
      gateOf({ stars: starsFor(1, 19, 2), paidChapters: [], entitlements: { vip: true } }, 2),
    ).not.toBeNull();
  });

  it('a VIP pays the discounted price', () => {
    setVip(true, { level: 21, stars: starsFor(1, 17, 2) });
    expect(unlockChapterWithCoins(2, NOW)).toEqual({ kind: 'unlocked', coins: 45 });
    expect(useProgressStore.getState().coins).toBe(455);
  });

  it('the gate dialog shows the discounted price with a VIP −25% hint and the full price', async () => {
    setVip(true, { level: 21, stars: starsFor(1, 17, 2) });
    await render(
      <ChapterGateOverlay
        ui={ui}
        chapter={2}
        onReplay={jest.fn()}
        onUnlocked={jest.fn()}
        onClose={jest.fn()}
        onShop={jest.fn()}
      />,
    );
    expect(screen.getByText('Unlock for 45 coins')).toBeTruthy();
    expect(screen.getByTestId('chapter-gate-vip-discount')).toBeTruthy();
    expect(screen.getByText('VIP −25%')).toBeTruthy();
    expect(screen.getByText('60')).toBeTruthy();
  });

  it('non-VIP sees the normal price and no hint', async () => {
    setVip(false, { level: 21, stars: starsFor(1, 17, 2) });
    await render(
      <ChapterGateOverlay
        ui={ui}
        chapter={2}
        onReplay={jest.fn()}
        onUnlocked={jest.fn()}
        onClose={jest.fn()}
        onShop={jest.fn()}
      />,
    );
    expect(screen.getByText('Unlock for 60 coins')).toBeTruthy();
    expect(screen.queryByTestId('chapter-gate-vip-discount')).toBeNull();
  });
});

describe('VIP card benefits', () => {
  it('lists the new perks and amounts, and no streak freeze', async () => {
    await render(
      <VipCard
        ui={ui}
        active={false}
        priceOf={() => ({ kind: 'loading' })}
        disabled={false}
        onBuy={jest.fn()}
        onManage={jest.fn()}
        onTerms={jest.fn()}
        onPrivacy={jest.fn()}
      />,
    );
    expect(screen.getByText('+50 coins and +2 hints every day')).toBeTruthy();
    expect(screen.getByText('A free +Tube on every level, no ad')).toBeTruthy();
    expect(screen.getByText('Chapters unlock 25% cheaper')).toBeTruthy();
    expect(screen.queryByText(/streak freeze/i)).toBeNull();
    expect(ECONOMY).toMatchObject({ vipDailyCoins: 50, vipDailyHints: 2 });
  });
});
