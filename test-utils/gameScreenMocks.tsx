/**
 * Module factories shared by the game screen tests (Skia, audio and navigation are native).
 * `jest.mock` calls must stay in each test file; they require these factories.
 */
import { View } from 'react-native';

export type BoardCallbacks = Record<string, ((...args: number[]) => unknown) | undefined>;

/** Props the stub board received last, so tests can fire board events. */
export const boardProps: { current: BoardCallbacks | null } = { current: null };

export const boardModule = () => ({
  BoardView: (props: BoardCallbacks) => {
    boardProps.current = props;
    return <View testID="board" />;
  },
});

export const renderSettingsModule = () => ({
  useRenderSettings: () => ({ colorBlind: false, quality: 'high', reducedMotion: true }),
});

export const audioModule = () => ({
  play: jest.fn(),
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  initAudio: jest.fn(),
  shutdownAudio: jest.fn(),
});

export const routerModule = () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
      canDismiss: () => false,
      canGoBack: () => false,
    },
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useLocalSearchParams: () => ({}),
    Redirect: () => <Text>redirect</Text>,
  };
};

export const safeAreaModule = () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});

/** What the stubbed hint search resolves to. */
export const hintResult: { current: { from: number; to: number } | null } = { current: null };

export const hintModule = () => ({
  useHintSearch: () => () => Promise.resolve(hintResult.current),
  findHintChunked: () => Promise.resolve(hintResult.current),
});
