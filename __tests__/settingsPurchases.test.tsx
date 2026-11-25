import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SettingsScreen from '../app/settings';
import { MANAGE_SUBSCRIPTIONS_URL } from '@/config/constants';
import { getLevel } from '@/game/generator';
import { initI18n } from '@/i18n';
import { isPrivacyOptionsRequired, showPrivacyOptions } from '@/services/consent';
import { setIapProvider } from '@/services/iap';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { GameHud } from '@/ui/game/GameHud';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { VipBadge } from '@/ui/VipBadge';

import { createFakeIap, snapshot, type FakeIap } from '../test-utils/fakeIap';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/services/consent', () => ({
  isPrivacyOptionsRequired: jest.fn(() => false),
  showPrivacyOptions: jest.fn(() => Promise.resolve(true)),
  subscribeConsent: jest.fn(() => () => undefined),
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const openURL = jest.spyOn(Linking, 'openURL');
const privacyRequired = isPrivacyOptionsRequired as jest.Mock;
const openPrivacy = showPrivacyOptions as jest.Mock;

let iap: FakeIap;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  openURL.mockResolvedValue(undefined);
  privacyRequired.mockReturnValue(false);
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
  useProgressStore.setState(createDefaultProgress(NOW));
  useGameStore.setState({ session: null, parked: null, hint: null });
  iap = createFakeIap();
  setIapProvider(iap);
});

describe('Settings purchases and ad privacy', () => {
  it('restores purchases and opens subscription management', async () => {
    iap.restore.mockResolvedValueOnce({
      kind: 'restored',
      customer: snapshot({ entitlements: { noAds: false, vip: true } }),
    });
    await render(<SettingsScreen />);
    expect(screen.getByText('Purchases')).toBeTruthy();
    expect(screen.getByText("Coins, hints and undos can't be restored")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setting-restore'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(iap.restore).toHaveBeenCalledTimes(1);
    expect(useProgressStore.getState().entitlements.vip).toBe(true);
    expect(currentToast()?.key).toBe('iap.restored');
    await fireEvent.press(screen.getByTestId('setting-manage-subscription'));
    expect(openURL).toHaveBeenCalledWith(MANAGE_SUBSCRIPTIONS_URL);
  });

  it('hides Ad privacy options unless UMP requires them', async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByTestId('setting-ad-privacy')).toBeNull();
  });

  it('opens the privacy options form when required, and toasts a failure', async () => {
    privacyRequired.mockReturnValue(true);
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Ad privacy options'));
    expect(openPrivacy).toHaveBeenCalledTimes(1);
    expect(currentToast()).toBeNull();
    openPrivacy.mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByLabelText('Ad privacy options'));
    expect(currentToast()?.key).toBe('settings.adPrivacyFailed');
  });
});

describe('VIP badge', () => {
  it('shows only while VIP is active, on its own and in the game HUD', async () => {
    await render(<VipBadge />);
    expect(screen.queryByLabelText('VIP member')).toBeNull();
    await act(async () => {
      useProgressStore.setState({ entitlements: { noAds: false, vip: true } });
    });
    expect(screen.getByLabelText('VIP member')).toBeTruthy();
    useGameStore.getState().loadLevel(getLevel(4), 'level', NOW);
    const ui = {
      text: '#fff',
      textMuted: '#aaa',
      accent: '#0af',
      onAccent: '#000',
      surface: '#123',
    };
    await render(<GameHud ui={ui} onPause={jest.fn()} onSkip={jest.fn()} skipDisabled={false} />);
    expect(screen.getByTestId('vip-badge')).toBeTruthy();
  });
});
