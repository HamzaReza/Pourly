import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import DailyScreen from '../app/daily';
import ShopScreen from '../app/shop';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { useAuthStore } from '@/services/auth';
import { restorePurchases } from '@/services/fulfillment';
import type { StoreProduct } from '@/services/iapTypes';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { PauseOverlay } from '@/ui/game/overlays/PauseOverlay';
import { Screen } from '@/ui/Screen';
import { AccountSection } from '@/ui/settings/AccountSection';
import { CoinPackTile } from '@/ui/shop/CoinPackTile';
import { PriceButton } from '@/ui/shop/PriceButton';

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
jest.mock('@/services/fulfillment', () => ({
  buyProduct: jest.fn(),
  loadStoreProducts: jest.fn(() => Promise.resolve([])),
  purchasesAvailable: jest.fn(() => false),
  restorePurchases: jest.fn(),
}));
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ firstWeekday: 1 }],
}));
jest.mock('@/state/dailyLoader', () => ({
  prepareDaily: jest.fn(() => new Promise(() => undefined)),
  readyDaily: jest.fn(() => null),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockIcon = ({ name }: { name: string }) => (
    <MockText testID={`icon-${name}`}>{name}</MockText>
  );
  return { __esModule: true, default: MockIcon };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const ui = getTheme('classic').ui;
const restoreMock = restorePurchases as jest.Mock;

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const product: StoreProduct = {
  id: 'coins_500',
  title: '500 coins',
  priceString: '$0.99',
  price: 0.99,
  currencyCode: 'USD',
  billingPeriod: null,
} as unknown as StoreProduct;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useProgressStore.setState({ ...createDefaultProgress(NOW), lastSeenAt: NOW });
});

describe('Pause sheet', () => {
  it('shows the speaker icon that matches the sound setting', async () => {
    useSettingsStore.setState({ sound: true, haptics: false });
    await render(
      <PauseOverlay ui={ui} onResume={jest.fn()} onRestart={jest.fn()} onHome={jest.fn()} />,
    );
    expect(screen.getByTestId('icon-volume-high-outline')).toBeTruthy();
    await fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(useSettingsStore.getState().sound).toBe(false);
    expect(screen.getByTestId('icon-volume-mute-outline')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Haptics' })).not.toBeChecked();
  });
});

describe('Daily calendar', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    useProgressStore.setState({ ...createDefaultProgress(NOW), installDate: '2026-09-10' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rings today in the accent and fills completed days', async () => {
    useProgressStore.setState({
      dailyHistory: { '2026-11-20': { stars: 3, moves: 10 } },
    });
    await render(<DailyScreen />);
    const today = screen.getByLabelText('November 24, today');
    const ring = flat((today.children[0] as unknown as { props: { style: unknown } }).props.style);
    expect(ring).toMatchObject({ borderColor: ui.accent, borderWidth: 1.5 });
    const done = screen.getByLabelText('November 20, completed');
    const fill = flat((done.children[0] as unknown as { props: { style: unknown } }).props.style);
    expect(fill.backgroundColor).toBe(ui.accent);
    expect(fill.borderWidth).toBeUndefined();
  });
});

describe('Shop tiles and price pills', () => {
  it('a coin pack tile shows its tag; the highlighted one gets an accent outline', async () => {
    await render(
      <>
        <CoinPackTile
          ui={ui}
          tier={2}
          amount="1,500 coins"
          name="Bag of coins"
          tag="Popular"
          highlighted
          price={<Text>price</Text>}
          testID="popular"
        />
        <CoinPackTile
          ui={ui}
          tier={1}
          amount="500 coins"
          name="Handful of coins"
          price={<Text>price</Text>}
          testID="plain"
        />
      </>,
    );
    expect(within(screen.getByTestId('popular')).getByText('Popular')).toBeTruthy();
    expect(flat(screen.getByTestId('popular').props.style).borderColor).toBe(ui.accent);
    expect(flat(screen.getByTestId('plain').props.style).borderColor).not.toBe(ui.accent);
    expect(within(screen.getByTestId('plain')).queryByText('Popular')).toBeNull();
  });

  it('a price pill stretches to the tile with fill, in ready and unavailable states', async () => {
    await render(
      <>
        <PriceButton
          ui={ui}
          name="500 coins"
          price={{ kind: 'ready', product }}
          disabled={false}
          onBuy={jest.fn()}
          fill
          testID="ready"
        />
        <PriceButton
          ui={ui}
          name="500 coins"
          price={{ kind: 'unavailable' }}
          disabled={false}
          onBuy={jest.fn()}
          fill
          testID="unavailable"
        />
        <PriceButton
          ui={ui}
          name="Remove Ads"
          price={{ kind: 'ready', product }}
          disabled={false}
          onBuy={jest.fn()}
          testID="compact"
        />
      </>,
    );
    expect(flat(screen.getByTestId('ready').props.style).alignSelf).toBe('stretch');
    expect(flat(screen.getByTestId('unavailable').props.style).alignSelf).toBe('stretch');
    expect(screen.getByTestId('unavailable')).toBeDisabled();
    expect(flat(screen.getByTestId('compact').props.style).alignSelf).toBeUndefined();
  });

  it('Restore purchases is disabled while a restore runs', async () => {
    let finish: () => void = () => undefined;
    restoreMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(<ShopScreen />);
    const restore = () => screen.getByTestId('shop-restore');
    expect(restore()).not.toBeDisabled();
    await fireEvent.press(restore());
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(restore()).toBeDisabled();
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(restore()).not.toBeDisabled();
  });
});

describe('Account section', () => {
  it('signed in: a profile row with the email initial, then Sign out and Delete (danger)', async () => {
    useAuthStore.setState({
      available: true,
      status: 'signedIn',
      user: { uid: 'u1', email: 'player@example.com', displayName: 'Player' },
      purchasesLinked: true,
      pending: null,
    });
    await render(<AccountSection ui={ui} onDelete={jest.fn()} />);
    const profile = screen.getByLabelText('Signed in as player@example.com');
    expect(within(profile).getByText('P')).toBeTruthy();
    expect(within(profile).getByText('Google')).toBeTruthy();
    expect(screen.getByTestId('setting-sign-out')).toBeTruthy();
    expect(screen.getByTestId('icon-trash-outline')).toBeTruthy();
  });

  it('without an email: a person glyph and "Signed in with Google"', async () => {
    useAuthStore.setState({
      available: true,
      status: 'signedIn',
      user: { uid: 'u1', email: null, displayName: null },
      purchasesLinked: true,
      pending: null,
    } as never);
    await render(<AccountSection ui={ui} onDelete={jest.fn()} />);
    const profile = screen.getByLabelText('Signed in with Google');
    expect(within(profile).getByTestId('icon-person')).toBeTruthy();
  });
});

describe('Screen header', () => {
  it('gives the start and end slots equal flex so the title stays centred', async () => {
    await render(
      <Screen title="Levels" headerEnd={<Text testID="wide">a very wide accessory</Text>} />,
    );
    const end = screen.getByTestId('wide').parent;
    const title = screen.getByRole('header', { name: 'Levels' });
    const start = screen.getByLabelText('Back').parent;
    expect(flat(start?.props.style).flex).toBe(1);
    expect(flat(end?.props.style).flex).toBe(1);
    expect(flat(title.props.style).flex).toBeUndefined();
  });
});
