import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { getMockAd, mockAdsProvider } from '@/services/ads.mock';
import { useSettingsStore } from '@/state/settingsStore';
import { MockAdHost } from '@/ui/MockAdHost';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { PauseOverlay } from '@/ui/game/overlays/PauseOverlay';
import { RestartConfirmOverlay } from '@/ui/game/overlays/RestartConfirmOverlay';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { WinOverlay } from '@/ui/game/overlays/WinOverlay';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());

const ui = getTheme('classic').ui;

beforeAll(async () => {
  await initI18n('en');
});

describe('win overlay', () => {
  it('shows the stars, coins and buttons and wires them', async () => {
    const onNext = jest.fn();
    const onDouble = jest.fn(() => Promise.resolve(true));
    const onHome = jest.fn();
    await render(
      <WinOverlay
        ui={ui}
        result={{ stars: 2, coins: 13, skipped: false, doubled: false }}
        onNext={onNext}
        onDouble={onDouble}
        onHome={onHome}
      />,
    );
    expect(screen.getByText('Level complete!')).toBeTruthy();
    expect(screen.getByLabelText('2 of 3 stars')).toBeTruthy();
    expect(screen.getByLabelText('13 coins earned')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    await fireEvent.press(screen.getByLabelText('Double your coins by watching an ad'));
    await fireEvent.press(screen.getByText('Home'));
    expect([onNext, onDouble, onHome].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('shows doubled coins and hides the double button afterwards', async () => {
    await render(
      <WinOverlay
        ui={ui}
        result={{ stars: 3, coins: 16, skipped: false, doubled: true }}
        onNext={jest.fn()}
        onDouble={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('32 coins earned')).toBeTruthy();
    expect(screen.queryByText('Double coins')).toBeNull();
  });
});

describe('stuck overlay', () => {
  it('offers undo, +tube, restart, skip and keep looking', async () => {
    const handlers = {
      onUndo: jest.fn(),
      onAddTube: jest.fn(),
      onRestart: jest.fn(),
      onSkip: jest.fn(),
      onClose: jest.fn(),
    };
    await render(
      <StuckOverlay
        ui={ui}
        canUndo
        tubeCost={{ kind: 'inventory', item: 'extraTubes', owned: 2 }}
        busy={false}
        {...handlers}
      />,
    );
    expect(screen.getByText('No moves left')).toBeTruthy();
    await fireEvent.press(screen.getByText('Undo'));
    await fireEvent.press(screen.getByText('Use +Tube (2 left)'));
    await fireEvent.press(screen.getByText('Restart'));
    await fireEvent.press(screen.getByLabelText('Skip this level by watching an ad'));
    await fireEvent.press(screen.getByText('Keep looking'));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hides undo and disables +tube at the level cap', async () => {
    await render(
      <StuckOverlay
        ui={ui}
        canUndo={false}
        tubeCost={{ kind: 'unavailable' }}
        busy
        onUndo={jest.fn()}
        onAddTube={jest.fn()}
        onRestart={jest.fn()}
        onSkip={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.getByText('Tube limit reached for this level')).toBeDisabled();
    expect(screen.getByLabelText('Skip this level by watching an ad')).toBeDisabled();
  });
});

describe('pause overlay', () => {
  it('resumes, restarts, goes home and toggles sound and haptics', async () => {
    useSettingsStore.setState({ sound: true, haptics: true });
    const handlers = { onResume: jest.fn(), onRestart: jest.fn(), onHome: jest.fn() };
    await render(<PauseOverlay ui={ui} {...handlers} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    await fireEvent.press(screen.getByText('Resume'));
    await fireEvent.press(screen.getByText('Restart'));
    await fireEvent.press(screen.getByText('Home'));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
    const sound = screen.getByRole('switch', { name: 'Sound' });
    expect(sound).toBeChecked();
    await fireEvent.press(sound);
    expect(useSettingsStore.getState().sound).toBe(false);
    await fireEvent.press(screen.getByRole('switch', { name: 'Haptics' }));
    expect(useSettingsStore.getState().haptics).toBe(false);
  });
});

describe('not-enough-coins overlay', () => {
  it('names the item and cost and offers an ad or the shop', async () => {
    const handlers = { onWatchAd: jest.fn(), onShop: jest.fn(), onClose: jest.fn() };
    await render(
      <NotEnoughCoinsOverlay
        ui={ui}
        powerUp="extraTube"
        cost={40}
        coins={12}
        busy={false}
        {...handlers}
      />,
    );
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('An extra tube costs 40 coins. You have 12.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Watch an ad to get an extra tube'));
    await fireEvent.press(screen.getByText('Shop'));
    await fireEvent.press(screen.getByText('Close'));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('restart confirmation and reward', () => {
  it('confirms or cancels a restart', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<RestartConfirmOverlay ui={ui} onConfirm={onConfirm} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText('Restart anyway'));
    await fireEvent.press(screen.getByText('Keep playing'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lists granted items', async () => {
    const onContinue = jest.fn();
    await render(
      <RewardOverlay
        ui={ui}
        title="Reward"
        reward={{ coins: 50, hints: 2 }}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByLabelText('+50 coins')).toBeTruthy();
    expect(screen.getByText('+2 hints')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('mock ad host', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('counts down 3 seconds, then the close button earns the reward', async () => {
    mockAdsProvider.preload();
    await render(<MockAdHost />);
    let result: Promise<string> = Promise.resolve('');
    await act(async () => {
      result = mockAdsProvider.showRewarded('HINT');
    });
    expect(screen.getByText('TEST AD (mock)')).toBeTruthy();
    expect(screen.getByText('Reward in 3 s')).toBeTruthy();
    expect(screen.getByLabelText('Close ad without the reward')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(3000));
    expect(screen.getByText('Reward earned')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close ad'));
    await expect(result).resolves.toBe('earned');
    expect(getMockAd()).toBeNull();
    expect(screen.queryByText('TEST AD (mock)')).toBeNull();
  });

  it('closing early dismisses the ad', async () => {
    await act(() => jest.advanceTimersByTime(2000));
    await render(<MockAdHost />);
    let result: Promise<string> = Promise.resolve('');
    await act(async () => {
      result = mockAdsProvider.showRewarded('UNDO');
    });
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Reward in 2 s')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close ad without the reward'));
    await expect(result).resolves.toBe('dismissed');
    expect(getMockAd()).toBeNull();
  });
});
