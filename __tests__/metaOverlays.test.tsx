import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { WinOverlay } from '@/ui/game/overlays/WinOverlay';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());

const ui = getTheme('classic').ui;

beforeAll(async () => {
  await initI18n('en');
});

describe('phase 6 overlay variants', () => {
  it('daily win: title, streak, coins, Home primary and double, no Next', async () => {
    const onHome = jest.fn();
    await render(
      <WinOverlay
        ui={ui}
        result={{
          stars: 3,
          coins: 50,
          skipped: false,
          doubled: false,
          daily: { streak: 5, rewarded: true },
        }}
        onNext={jest.fn()}
        onDouble={jest.fn(() => Promise.resolve(true))}
        onHome={onHome}
      />,
    );
    expect(screen.getByText('Daily complete!')).toBeTruthy();
    expect(screen.getByText('5 day streak')).toBeTruthy();
    expect(screen.getByLabelText('50 coins earned')).toBeTruthy();
    expect(screen.getByLabelText('Double your coins by watching an ad')).toBeTruthy();
    expect(screen.queryByTestId('win-next')).toBeNull();
    await fireEvent.press(screen.getByTestId('win-home'));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('daily replay win shows the note and no coins or double', async () => {
    await render(
      <WinOverlay
        ui={ui}
        result={{
          stars: 1,
          coins: 0,
          skipped: false,
          doubled: false,
          daily: { streak: 1, rewarded: false },
        }}
        onNext={jest.fn()}
        onDouble={jest.fn(() => Promise.resolve(false))}
        onHome={jest.fn()}
      />,
    );
    expect(screen.getByText('Already done today. Replays are just for fun.')).toBeTruthy();
    expect(screen.queryByLabelText('0 coins earned')).toBeNull();
    expect(screen.queryByLabelText('Double your coins by watching an ad')).toBeNull();
  });

  it('stuck overlay without onSkip hides Skip', async () => {
    await render(
      <StuckOverlay
        ui={ui}
        canUndo
        canAddTube
        busy={false}
        onUndo={jest.fn()}
        onAddTube={jest.fn()}
        onRestart={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText('Skip this level by watching an ad')).toBeNull();
    expect(screen.getByText('Undo a move, add a tube or restart.')).toBeTruthy();
  });

  it('not-enough-coins item variant offers the Shop only', async () => {
    const onShop = jest.fn();
    await render(
      <NotEnoughCoinsOverlay
        ui={ui}
        itemName="The Neon theme"
        cost={1000}
        coins={120}
        busy={false}
        onShop={onShop}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('The Neon theme costs 1000 coins. You have 120.')).toBeTruthy();
    expect(screen.queryByText('Watch ad')).toBeNull();
    await fireEvent.press(screen.getByText('Shop'));
    expect(onShop).toHaveBeenCalledTimes(1);
  });

  it('reward overlay renders extra actions before Continue', async () => {
    await render(
      <RewardOverlay ui={ui} title="Daily gift" reward={{ hints: 2 }} onContinue={jest.fn()}>
        <Text>extra action</Text>
      </RewardOverlay>,
    );
    expect(screen.getByText('+2 hints')).toBeTruthy();
    expect(screen.getByText('extra action')).toBeTruthy();
  });
});
