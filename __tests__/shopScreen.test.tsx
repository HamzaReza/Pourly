import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import ShopScreen from '../app/shop';
import { MANAGE_SUBSCRIPTIONS_URL, PRIVACY_URL, TERMS_URL } from '@/config/constants';
import { initI18n } from '@/i18n';
import { ads } from '@/services/ads';
import { setIapProvider, unavailableIapProvider } from '@/services/iap';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { createFakeIap, snapshot, success, type FakeIap } from '../test-utils/fakeIap';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
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
const openURL = jest.spyOn(Linking, 'openURL');
const showRewarded = ads.showRewarded as jest.Mock;

let iap: FakeIap;

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), lastSeenAt: NOW, ...overrides });

/** Renders the Shop and lets the catalog load. */
const renderShop = async () => {
  await render(<ShopScreen />);
  await act(async () => {
    await Promise.resolve();
  });
};

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  openURL.mockResolvedValue(undefined);
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
  setProgress();
  iap = createFakeIap();
  setIapProvider(iap);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Shop', () => {
  it('shows store prices for every product, with VIP periods and the purchase links', async () => {
    await renderShop();
    expect(screen.getByLabelText('Buy 500 coins for 1,09 €')).toBeTruthy();
    expect(screen.getByLabelText('Buy 1,500 coins for 3,29 €')).toBeTruthy();
    expect(screen.getByLabelText('Buy 4,000 coins for 7,49 €')).toBeTruthy();
    expect(screen.getByLabelText('Buy Remove Ads for 4,49 €')).toBeTruthy();
    expect(screen.getByText('2,29 € per week')).toBeTruthy();
    expect(screen.getByText('6,49 € per month')).toBeTruthy();
    expect(
      screen.getByLabelText('Subscribe to VIP Weekly: 2,29 € per week, renews automatically'),
    ).toBeTruthy();
    expect(screen.getByText('No ads between levels')).toBeTruthy();
    expect(screen.getByText('+50 coins and +2 hints every day')).toBeTruthy();
    expect(screen.getByText(/renew automatically/)).toBeTruthy();
    expect(screen.queryByTestId('shop-starter-pack')).toBeNull();
    expect(screen.getByLabelText('Balance: 100 coins')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Terms of Service'));
    expect(openURL).toHaveBeenCalledWith(TERMS_URL);
    await fireEvent.press(screen.getByLabelText('Privacy Policy'));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_URL);
    await fireEvent.press(screen.getByTestId('shop-manage'));
    expect(openURL).toHaveBeenCalledWith(MANAGE_SUBSCRIPTIONS_URL);
  });

  it('shows spinners while prices load', async () => {
    iap.getProducts.mockImplementationOnce(() => new Promise(() => undefined));
    await renderShop();
    expect(screen.getAllByLabelText('Loading prices…').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Buy 500 coins for 1,09 €')).toBeNull();
  });

  it('shows the unavailable state in a build without purchases', async () => {
    setIapProvider(unavailableIapProvider);
    await renderShop();
    expect(screen.getByText('Store unavailable')).toBeTruthy();
    expect(screen.queryByTestId('shop-retry')).toBeNull();
    expect(screen.getAllByLabelText('Remove Ads is not available right now').length).toBe(1);
  });

  it('offers a retry when the store cannot be reached', async () => {
    iap.getProducts.mockRejectedValueOnce(new Error('offline'));
    await renderShop();
    expect(screen.getByText("Couldn't load the store. Check your connection.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shop-retry'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('shop-unavailable')).toBeNull();
    expect(screen.getByLabelText('Buy 500 coins for 1,09 €')).toBeTruthy();
  });

  it('buys a coin pack and thanks the player with the reward', async () => {
    iap.purchase.mockResolvedValueOnce(success('coins_500', 'GPA.SHOP'));
    await renderShop();
    await fireEvent.press(screen.getByLabelText('Buy 500 coins for 1,09 €'));
    expect(iap.purchase).toHaveBeenCalledWith('coins_500');
    expect(useProgressStore.getState().coins).toBe(600);
    expect(screen.getByText('Thank you!')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.queryByText('Thank you!')).toBeNull();
  });

  it('offers Restore when the store says the item is already owned', async () => {
    iap.purchase.mockResolvedValueOnce({ kind: 'alreadyOwned' });
    iap.restore.mockResolvedValueOnce({
      kind: 'restored',
      customer: snapshot({ entitlements: { noAds: true, vip: false } }),
    });
    await renderShop();
    await fireEvent.press(screen.getByLabelText('Buy Remove Ads for 4,49 €'));
    expect(screen.getByTestId('shop-already-owned')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Restore purchases')[0]!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(iap.restore).toHaveBeenCalled();
    expect(screen.queryByTestId('shop-already-owned')).toBeNull();
    expect(screen.getByLabelText('Remove Ads: owned')).toBeTruthy();
  });

  it('shows Owned and VIP Active with Manage', async () => {
    setProgress({ entitlements: { noAds: true, vip: true } });
    await renderShop();
    expect(screen.getByLabelText('Remove Ads: owned')).toBeTruthy();
    expect(screen.getByLabelText('Your VIP subscription is active')).toBeTruthy();
    expect(screen.queryByTestId('buy-vip_weekly')).toBeNull();
    expect(screen.getAllByText('Manage subscription')).toHaveLength(2);
  });

  it('shows the Starter Pack with its countdown while the offer runs', async () => {
    setProgress({ level: 9, starterPackExpiresAt: NOW + 2 * 3_600_000 + 5_000 });
    await renderShop();
    expect(screen.getByTestId('shop-starter-pack')).toBeTruthy();
    expect(screen.getByText('Ends in 02:00:05')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Ends in 02:00:03')).toBeTruthy();
    iap.purchase.mockResolvedValueOnce(success('starter_pack'));
    await fireEvent.press(screen.getByLabelText('Buy Starter Pack for 2,19 €'));
    expect(screen.queryByTestId('shop-starter-pack')).toBeNull();
    expect(useProgressStore.getState().ownedThemes).toContain('aurora');
  });

  it('hides an expired or bought Starter Pack', async () => {
    setProgress({ level: 9, starterPackExpiresAt: NOW - 1 });
    await renderShop();
    expect(screen.queryByTestId('shop-starter-pack')).toBeNull();
  });

  it('runs Free coins with a live cooldown and the daily cap', async () => {
    showRewarded.mockResolvedValueOnce('earned');
    await renderShop();
    expect(screen.getByText('+50 coins for a short ad · 5 left today')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('free-coins-button'));
    expect(showRewarded).toHaveBeenCalledWith('FREE_COINS');
    expect(useProgressStore.getState().coins).toBe(150);
    expect(currentToast()).toMatchObject({ key: 'shop.freeCoins.granted' });
    expect(screen.getByText('Next in 05:00')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });
    expect(screen.getByText('Next in 03:59')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('free-coins-button'));
    expect(showRewarded).toHaveBeenCalledTimes(1);
  });

  it('says come back tomorrow once the daily cap is reached', async () => {
    setProgress({
      ads: {
        ...createDefaultProgress(NOW).ads,
        freeCoinsClaimsToday: 5,
        freeCoinsDate: '2026-11-24',
        lastFreeCoinsAt: NOW - 3_600_000,
      },
    });
    await renderShop();
    expect(screen.getByText("That's all for today. Come back tomorrow!")).toBeTruthy();
  });
});
