import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { BackHandler, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { RewardBundle } from '@/config/economy';
import type { PowerUp } from '@/game/economy';
import { isTutorialLevel } from '@/game/tutorial';
import type { Board, Move } from '@/game/types';
import { BoardView } from '@/render/Board';
import type { Rect } from '@/render/layout';
import type { CanvasSize } from '@/render/scene';
import type { Theme, ThemeUi } from '@/render/themes';
import { useHintSearch } from '@/render/useHint';
import { useRenderSettings } from '@/render/useRenderSettings';
import { play } from '@/services/audio';
import { hapticError, hapticPourStart, hapticSelect, hapticSuccess } from '@/services/haptics';
import {
  activatePowerUp,
  buyPowerUpWithAd,
  commitPlayerPour,
  doubleWinCoins,
  ensureLevelSession,
  onNextPressed,
  restartLevel,
  restartNeedsConfirm,
  skipWithAd,
  type PowerUpResult,
} from '@/state/gameFlow';
import {
  isActive,
  isResumable,
  selectBoard,
  selectCanUndo,
  selectStatus,
  useGameStore,
} from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { ActionBar } from '@/ui/game/ActionBar';
import { createBoardEvents, type BoardEvents } from '@/ui/game/boardEvents';
import { GameHud } from '@/ui/game/GameHud';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { PauseOverlay } from '@/ui/game/overlays/PauseOverlay';
import { RestartConfirmOverlay } from '@/ui/game/overlays/RestartConfirmOverlay';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { WinOverlay } from '@/ui/game/overlays/WinOverlay';
import { TutorialGuide } from '@/ui/game/TutorialGuide';
import { FpsOverlay } from '@/ui/FpsOverlay';
import { goHome } from '@/ui/Screen';
import { revealApp } from '@/ui/splash';
import { useActiveTheme } from '@/ui/theme';
import { showToast } from '@/ui/Toast';
import { MIN_TOUCH_TARGET, spacing } from '@/ui/tokens';

/** Height reserved for the top bar (pause, level title, skip, coins). */
const TOP_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.md;
/** Height reserved for the bottom action bar (undo, hint, restart, +tube). */
const BOTTOM_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.xxl;

type HintSearch = () => Promise<Move | null>;

/** Overlays opened by the player's actions (the others follow the game status). */
type ModalState =
  | {
      readonly kind: 'notEnough';
      readonly powerUp: PowerUp;
      readonly cost: number;
      readonly move: Move | null;
      readonly board: Board | null;
    }
  | { readonly kind: 'confirmRestart' }
  | { readonly kind: 'reward'; readonly reward: RewardBundle }
  | null;

const onPourStart = (): void => {
  play('pour');
  hapticPourStart();
};

const onPourLand = (): void => play('drop');

const onTubeComplete = (): void => {
  play('complete');
  hapticSuccess();
};

const onWinStart = (): void => {
  play('win');
  hapticSuccess();
};

const game = () => useGameStore.getState();

interface GameBoardProps {
  board: Board;
  size: CanvasSize;
  area: Rect;
  theme: Theme;
  events: BoardEvents;
  searchRef: RefObject<HintSearch | null>;
  onWinSequenceEnd: () => void;
}

/** The Skia board bound to the game store. Re-renders only when the board or hint changes. */
const GameBoardComponent = ({
  board,
  size,
  area,
  theme,
  events,
  searchRef,
  onWinSequenceEnd,
}: GameBoardProps) => {
  const { colorBlind, quality, reducedMotion } = useRenderSettings();
  const hint = useGameStore((state) => state.hint);
  const requestHint = useHintSearch(board);

  useEffect(() => {
    searchRef.current = requestHint;
  }, [requestHint, searchRef]);

  const onSelect = useCallback(
    (index: number) => {
      events.emit({ type: 'select', index });
      if (index < 0) return;
      play('select');
      hapticSelect();
    },
    [events],
  );

  const onPour = useCallback(
    (from: number, to: number) => {
      const outcome = commitPlayerPour(from, to);
      if (outcome !== null) events.emit({ type: 'pour', move: { from, to } });
      return outcome;
    },
    [events],
  );

  const onInvalidMove = useCallback(() => {
    play('error');
    hapticError();
    events.emit({ type: 'invalid' });
  }, [events]);

  const onSettled = useCallback(() => events.emit({ type: 'settled' }), [events]);

  return (
    <BoardView
      board={board}
      size={size}
      area={area}
      theme={theme}
      colorBlind={colorBlind}
      quality={quality}
      reducedMotion={reducedMotion}
      hint={hint}
      onSelect={onSelect}
      onPour={onPour}
      onPourStart={onPourStart}
      onPourLand={onPourLand}
      onTubeComplete={onTubeComplete}
      onInvalidMove={onInvalidMove}
      onWinStart={onWinStart}
      onWinSequenceEnd={onWinSequenceEnd}
      onSettled={onSettled}
    />
  );
};

const GameBoard = memo(GameBoardComponent);

interface BoardLayerProps extends Omit<GameBoardProps, 'board'> {
  tutorialLevel: number | null;
  showTutorial: boolean;
  reducedMotion: boolean;
  ui: ThemeUi;
}

/** Subscribes to the board so the screen itself does not re-render on every pour. */
const BoardLayerComponent = ({
  tutorialLevel,
  showTutorial,
  reducedMotion,
  ui,
  ...props
}: BoardLayerProps) => {
  const board = useGameStore(selectBoard);
  if (board === null) return null;
  return (
    <>
      <GameBoard board={board} {...props} />
      {tutorialLevel !== null && showTutorial ? (
        <TutorialGuide
          key={tutorialLevel}
          board={board}
          area={props.area}
          level={tutorialLevel}
          events={props.events}
          reducedMotion={reducedMotion}
          ui={ui}
        />
      ) : null}
    </>
  );
};

const BoardLayer = memo(BoardLayerComponent);

export default function GameScreen() {
  const { t } = useTranslation();
  const theme = useActiveTheme();
  const ui = theme.ui;
  const insets = useSafeAreaInsets();
  const { reducedMotion } = useRenderSettings();
  const [size, setSize] = useState<CanvasSize | null>(null);
  const [showFps, setShowFps] = useState(false);
  const [events] = useState(createBoardEvents);
  const searchRef = useRef<HintSearch | null>(null);
  const hintPending = useRef(false);
  const pausedByBlur = useRef(false);

  /** The session found at mount; shown only if it is still resumable (else a new one replaces it). */
  const [mountSession] = useState(() => game().session);
  const [mountLevel] = useState(() => useProgressStore.getState().level);
  const mountUsable = isResumable(mountSession, mountLevel);

  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [winSequenceDoneFor, setWinSequenceDoneFor] = useState<string | null>(null);
  const [stuckVisible, setStuckVisible] = useState(
    () => mountSession?.status === 'stuck' || mountSession?.pausedFrom === 'stuck',
  );

  const ready = useGameStore(
    (state) => state.session !== null && (state.session !== mountSession || mountUsable),
  );
  const levelId = useGameStore((state) => state.session?.levelId ?? null);
  const levelNumber = useGameStore((state) => state.session?.levelNumber ?? 0);
  const mode = useGameStore((state) => state.session?.mode ?? 'level');
  const status = useGameStore(selectStatus);
  const result = useGameStore((state) => state.session?.result ?? null);
  const canUndo = useGameStore(selectCanUndo);
  const extraTubeUsed = useGameStore((state) => state.session?.extraTubeUsed ?? true);
  const coins = useProgressStore((state) => state.coins);
  const tutorialDone = useProgressStore((state) => state.tutorialDone);

  useLayoutEffect(() => {
    ensureLevelSession();
  }, []);

  useEffect(
    () =>
      events.subscribe((event) => {
        if (event.type === 'pour') setStuckVisible(false);
        else if (event.type === 'settled' && game().session?.status === 'stuck') {
          setStuckVisible(true);
        }
      }),
    [events],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous !== null && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  useEffect(() => {
    if (ready && size !== null) revealApp();
  }, [ready, size]);

  const area = useMemo<Rect | null>(() => {
    if (size === null) return null;
    const x = insets.left + spacing.sm;
    const y = insets.top + TOP_BAR_HEIGHT;
    return {
      x,
      y,
      width: Math.max(0, size.width - x - insets.right - spacing.sm),
      height: Math.max(0, size.height - y - insets.bottom - BOTTOM_BAR_HEIGHT),
    };
  }, [size, insets.left, insets.top, insets.right, insets.bottom]);

  // ---- actions --------------------------------------------------------------------------------

  const withAd = useCallback(async <T,>(show: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await show();
    } finally {
      setBusy(false);
    }
  }, []);

  const handleResult = useCallback(
    (outcome: PowerUpResult, move: Move | null = null, board: Board | null = null) => {
      if (outcome.kind === 'needsPayment') {
        setModal({ kind: 'notEnough', powerUp: outcome.powerUp, cost: outcome.cost, move, board });
      } else if (outcome.kind === 'applied') {
        play('tap');
      }
    },
    [],
  );

  const onUndo = useCallback(() => handleResult(activatePowerUp('undo')), [handleResult]);
  const onAddTube = useCallback(() => handleResult(activatePowerUp('extraTube')), [handleResult]);

  const onHint = useCallback(() => {
    const search = searchRef.current;
    if (search === null || hintPending.current) return;
    const board = game().session?.history.current ?? null;
    hintPending.current = true;
    search()
      .then((move) => {
        if (game().session?.history.current !== board) return;
        if (move === null) {
          showToast('game.noHint');
          return;
        }
        handleResult(activatePowerUp('hint', move), move, board);
      })
      .finally(() => {
        hintPending.current = false;
      });
  }, [handleResult]);

  const onRestart = useCallback(() => {
    if (restartNeedsConfirm()) setModal({ kind: 'confirmRestart' });
    else restartLevel();
  }, []);

  const confirmRestart = useCallback(() => {
    setModal(null);
    restartLevel();
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const onWatchAd = useCallback(() => {
    if (modal === null || modal.kind !== 'notEnough') return;
    const { powerUp, move, board } = modal;
    void withAd(() => buyPowerUpWithAd(powerUp, move, board)).then((outcome) => {
      if (outcome.kind === 'applied') setModal(null);
      else if (outcome.kind === 'granted') setModal({ kind: 'reward', reward: outcome.reward });
    });
  }, [modal, withAd]);

  const onShop = useCallback(() => {
    setModal(null);
    router.push('/shop');
  }, []);

  const onSkip = useCallback(() => {
    void withAd(skipWithAd).then((skipped) => {
      if (skipped) setStuckVisible(false);
    });
  }, [withAd]);

  const onDouble = useCallback(() => withAd(doubleWinCoins), [withAd]);

  const onNext = useCallback(() => {
    setModal(null);
    onNextPressed();
  }, []);

  const onPause = useCallback(() => game().pause(), []);
  const onResume = useCallback(() => game().resume(), []);
  const dismissStuck = useCallback(() => setStuckVisible(false), []);
  const onWinSequenceEnd = useCallback(() => setWinSequenceDoneFor(levelId), [levelId]);
  const toggleFps = useCallback(() => setShowFps((visible) => !visible), []);

  // ---- overlay visibility and hardware back ---------------------------------------------------

  const showStuck = stuckVisible && status === 'stuck';
  const showPause = status === 'paused';
  const showWin =
    status === 'won' && result !== null && !result.skipped && winSequenceDoneFor === levelId;
  const showSkipped = status === 'won' && result !== null && result.skipped;

  const backAction = useRef<() => void>(() => undefined);
  useEffect(() => {
    backAction.current = () => {
      if (modal !== null) setModal(null);
      else if (showPause) game().resume();
      else if (showStuck) setStuckVisible(false);
      else if (showSkipped) onNext();
      else if (status === 'won') goHome();
      else game().pause();
    };
  }, [modal, showPause, showStuck, showSkipped, status, onNext]);

  useFocusEffect(
    useCallback(() => {
      if (pausedByBlur.current) {
        pausedByBlur.current = false;
        game().resume();
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        backAction.current();
        return true;
      });
      return () => {
        subscription.remove();
        const session = game().session;
        if (session !== null && isActive(session.status)) {
          game().pause();
          pausedByBlur.current = true;
        }
      };
    }, []),
  );

  const tutorialLevel =
    mode === 'level' && isTutorialLevel(levelNumber, tutorialDone) ? levelNumber : null;
  const overlayOpen = modal !== null || showPause || showStuck || showWin || showSkipped;
  const live = status !== null && isActive(status);

  return (
    <View style={[styles.root, { backgroundColor: theme.background[0] }]} onLayout={onLayout}>
      <StatusBar style={theme.statusBar} />
      {ready && size !== null && area !== null ? (
        <BoardLayer
          size={size}
          area={area}
          theme={theme}
          events={events}
          searchRef={searchRef}
          onWinSequenceEnd={onWinSequenceEnd}
          tutorialLevel={tutorialLevel}
          showTutorial={live && !overlayOpen}
          reducedMotion={reducedMotion}
          ui={ui}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.topBar,
          { top: insets.top, start: insets.left + spacing.sm, end: insets.right + spacing.sm },
        ]}
      >
        <GameHud
          ui={ui}
          onPause={onPause}
          onTitleLongPress={__DEV__ ? toggleFps : undefined}
          onSkip={onSkip}
          skipDisabled={busy}
        />
      </View>
      <View
        pointerEvents="box-none"
        style={[
          styles.bottomBar,
          {
            bottom: insets.bottom,
            start: insets.left + spacing.sm,
            end: insets.right + spacing.sm,
          },
        ]}
      >
        <ActionBar
          ui={ui}
          onUndo={onUndo}
          onHint={onHint}
          onRestart={onRestart}
          onAddTube={onAddTube}
        />
      </View>
      {__DEV__ && showFps ? (
        <View
          pointerEvents="none"
          style={[styles.fps, { top: insets.top + TOP_BAR_HEIGHT, end: insets.right + spacing.sm }]}
        >
          <FpsOverlay />
        </View>
      ) : null}
      {showWin && result !== null ? (
        <WinOverlay ui={ui} result={result} onNext={onNext} onDouble={onDouble} onHome={goHome} />
      ) : null}
      {showSkipped ? (
        <RewardOverlay
          ui={ui}
          title={t('reward.skippedTitle')}
          message={t('reward.skippedMessage', { n: levelNumber })}
          reward={{}}
          onContinue={onNext}
        />
      ) : null}
      {showStuck ? (
        <StuckOverlay
          ui={ui}
          canUndo={canUndo}
          canAddTube={!extraTubeUsed}
          busy={busy}
          onUndo={onUndo}
          onAddTube={onAddTube}
          onRestart={onRestart}
          onSkip={onSkip}
          onClose={dismissStuck}
        />
      ) : null}
      {showPause ? (
        <PauseOverlay ui={ui} onResume={onResume} onRestart={onRestart} onHome={goHome} />
      ) : null}
      {modal?.kind === 'notEnough' ? (
        <NotEnoughCoinsOverlay
          ui={ui}
          powerUp={modal.powerUp}
          cost={modal.cost}
          coins={coins}
          busy={busy}
          onWatchAd={onWatchAd}
          onShop={onShop}
          onClose={closeModal}
        />
      ) : null}
      {modal?.kind === 'confirmRestart' ? (
        <RestartConfirmOverlay ui={ui} onConfirm={confirmRestart} onCancel={closeModal} />
      ) : null}
      {modal?.kind === 'reward' ? (
        <RewardOverlay
          ui={ui}
          title={t('reward.title')}
          message={t('game.rewardSaved')}
          reward={modal.reward}
          onContinue={closeModal}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomBar: {
    position: 'absolute',
    height: BOTTOM_BAR_HEIGHT,
    justifyContent: 'center',
  },
  fps: {
    position: 'absolute',
  },
});
