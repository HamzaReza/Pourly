import { fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '../app/settings';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { deleteAccount, signInWithGoogle, signOut, useAuthStore } from '@/services/auth';
import { useCloudStore } from '@/state/cloudStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { SignInCard, shouldShowSignInCard } from '@/ui/home/SignInCard';
import { AccountSection } from '@/ui/settings/AccountSection';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/state/levelLoader', () => ({
  prepareLevel: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));
jest.mock('@/services/auth', () => ({
  ...jest.requireActual('@/services/auth'),
  signInWithGoogle: jest.fn(() => Promise.resolve('done')),
  signOut: jest.fn(() => Promise.resolve('done')),
  deleteAccount: jest.fn(() => Promise.resolve('done')),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const ui = getTheme('classic').ui;

const guest = {
  available: true,
  status: 'guest',
  user: null,
  purchasesLinked: false,
  pending: null,
} as const;
const signedIn = {
  available: true,
  status: 'signedIn',
  user: { uid: 'u1', email: 'player@example.com', displayName: 'Player' },
  purchasesLinked: true,
  pending: null,
} as const;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState(guest);
  useProgressStore.setState({ ...createDefaultProgress(NOW), level: 6 });
  useCloudStore.setState({ signInCardDismissal: 'none' });
});

describe('shouldShowSignInCard', () => {
  const input = {
    available: true,
    guest: true,
    level: 6,
    hasPurchase: false,
    dismissal: 'none',
  } as const;

  it('shows for guests in configured builds after level 5 or a purchase', () => {
    expect(shouldShowSignInCard(input)).toBe(true);
    expect(shouldShowSignInCard({ ...input, level: 5 })).toBe(false);
    expect(shouldShowSignInCard({ ...input, level: 2, hasPurchase: true })).toBe(true);
    expect(shouldShowSignInCard({ ...input, available: false })).toBe(false);
    expect(shouldShowSignInCard({ ...input, guest: false })).toBe(false);
  });

  it('returns after the first purchase when dismissed before one, never after', () => {
    expect(shouldShowSignInCard({ ...input, dismissal: 'beforePurchase' })).toBe(false);
    expect(shouldShowSignInCard({ ...input, dismissal: 'beforePurchase', hasPurchase: true })).toBe(
      true,
    );
    expect(shouldShowSignInCard({ ...input, dismissal: 'afterPurchase', hasPurchase: true })).toBe(
      false,
    );
  });
});

describe('Home sign-in card', () => {
  it('signs in from the card', async () => {
    await render(<SignInCard ui={ui} />);
    expect(screen.getByText('Sign in to save your progress')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sign in with Google'));
    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it('is dismissible and comes back once after the first purchase', async () => {
    await render(<SignInCard ui={ui} />);
    await fireEvent.press(screen.getByLabelText('Hide the sign-in suggestion'));
    expect(screen.queryByTestId('sign-in-card')).toBeNull();
    expect(useCloudStore.getState().signInCardDismissal).toBe('beforePurchase');

    useProgressStore.setState({ processedTransactions: ['GPA.1'] });
    await render(<SignInCard ui={ui} />);
    expect(screen.getByTestId('sign-in-card')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hide the sign-in suggestion'));
    expect(useCloudStore.getState().signInCardDismissal).toBe('afterPurchase');
    expect(screen.queryByTestId('sign-in-card')).toBeNull();
  });

  it('is hidden before level 6, for signed-in players and without cloud features', async () => {
    useProgressStore.setState({ level: 5 });
    await render(<SignInCard ui={ui} />);
    expect(screen.queryByTestId('sign-in-card')).toBeNull();
    useProgressStore.setState({ level: 9 });
    useAuthStore.setState(signedIn);
    await render(<SignInCard ui={ui} />);
    expect(screen.queryByTestId('sign-in-card')).toBeNull();
    useAuthStore.setState({ ...guest, available: false });
    await render(<SignInCard ui={ui} />);
    expect(screen.queryByTestId('sign-in-card')).toBeNull();
  });
});

describe('Settings account section', () => {
  it('says sign-in is unavailable in a build without cloud features', async () => {
    useAuthStore.setState({ ...guest, available: false });
    await render(<AccountSection ui={ui} onDelete={jest.fn()} />);
    expect(screen.getByText('Sign-in unavailable in this build')).toBeTruthy();
    expect(screen.queryByTestId('setting-sign-in')).toBeNull();
  });

  it('offers Google sign-in to guests with the benefit text', async () => {
    await render(<AccountSection ui={ui} onDelete={jest.fn()} />);
    expect(screen.getByText(/Save your progress and purchases/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setting-sign-in'));
    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it('shows the account email, Sign out and Delete when signed in', async () => {
    useAuthStore.setState(signedIn);
    const onDelete = jest.fn();
    await render(<AccountSection ui={ui} onDelete={onDelete} />);
    expect(screen.getByText('Signed in as player@example.com')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setting-sign-out'));
    expect(signOut).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('setting-delete-account'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('disables the rows while an account action runs', async () => {
    useAuthStore.setState({ ...signedIn, pending: 'signOut' });
    await render(<AccountSection ui={ui} onDelete={jest.fn()} />);
    expect(screen.getByText('Please wait…')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setting-sign-out'));
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('Settings → Delete account and data', () => {
  it('asks twice, explaining what is deleted, before deleting', async () => {
    useAuthStore.setState(signedIn);
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-delete-account'));
    expect(screen.getByTestId('delete-step-1')).toBeTruthy();
    expect(screen.getByText(/cloud save: levels, stars, coins/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByTestId('delete-step-2')).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('delete-step-2')).toBeNull();
  });

  it('can be cancelled at either step', async () => {
    useAuthStore.setState(signedIn);
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-delete-account'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByTestId('delete-step-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('setting-delete-account'));
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByTestId('delete-step-2')).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
