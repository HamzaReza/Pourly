import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { dailyLevelId } from '@/game/daily';
import { resolveExtraTubeCost, type PowerUp } from '@/game/economy';
import { isTutorialLevel } from '@/game/tutorial';
import type { Board, Move } from '@/game/types';
import { BoardView } from '@/render/Board';
import type { Rect } from '@/render/layout';
import type { CanvasSize } from '@/render/scene';
import type { Theme, ThemeUi } from '@/render/themes';
import { useHintSearch } from '@/render/useHint';
import { useRenderSettings } from '@/render/useRenderSettings';
import { formatNumber } from '@/i18n/format';
import { track } from '@/services/analytics';
import { play } from '@/services/audio';
import { hapticError, hapticPourStart, hapticSelect, hapticSuccess } from '@/services/haptics';
import { answerNotificationPrompt, notificationPromptDue } from '@/services/notificationPrompt';
import { currentReviewInput, requestReviewIfDue, reviewVerdict } from '@/services/review';
import {
  activatePowerUp,
  buyPowerUpWithAd,
  canUse,
  commitPlayerPour,
  costOf,
  doubleWinCoins,
  ensureDailySession,
  ensureLevelSession,
  ensureReplaySession,
  localToday,
  onNextPressed,
  restartLevel,
  restartNeedsConfirm,
  skipWithAd,
  type PowerUpResult,
} from '@/state/gameFlow';
import {
  isActive,
  isDailyResumable,
  isResumable,
  selectBoard,
  selectCanUndo,
  selectStatus,
  selectTubeAdUnavailable,
  useGameStore,
  type GameMode,
} from '@/state/gameStore';
import { currentProgressionGate } from '@/state/chapterFlow';
import { useProgressStore } from '@/state/progressStore';
import { ActionBar } from '@/ui/game/ActionBar';
import { createBoardEvents, type BoardEvents } from '@/ui/game/boardEvents';
import { GameHud } from '@/ui/game/GameHud';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { NotificationPromptOverlay } from '@/ui/game/overlays/NotificationPromptOverlay';
import { PauseOverlay } from '@/ui/game/overlays/PauseOverlay';
import { RestartConfirmOverlay } from '@/ui/game/overlays/RestartConfirmOverlay';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { TubeConfirmOverlay, type TubePayment } from '@/ui/game/overlays/TubeConfirmOverlay';
import { WinOverlay } from '@/ui/game/overlays/WinOverlay';
import { ChapterGateOverlay } from '@/ui/game/overlays/ChapterGateOverlay';
import { TutorialGuide } from '@/ui/game/TutorialGuide';
import { FpsOverlay } from '@/ui/FpsOverlay';
import { goBack, goHome } from '@/ui/Screen';
import { revealApp } from '@/ui/splash';
import { useActiveTheme } from '@/ui/theme';
import { showToast } from '@/ui/Toast';
import { MIN_TOUCH_TARGET, spacing } from '@/ui/tokens';

/** Height reserved for the top bar (pause, level title, skip, coins). */
const TOP_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.md;
/** Height reserved for the bottom action bar (undo, hint, restart, +tube). */
const BOTTOM_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.xxl;

type HintSearch = () => Promise<Move | null>;

/** How the player leaves the Win overlay (`levels`: back to the Levels screen after a replay). */
type WinExit = 'next' | 'home' | 'levels';

/** Overlays opened by the player's actions (the others follow the game status). */
type ModalState =
  | {
      readonly kind: 'notEnough';
      readonly powerUp: PowerUp;
      readonly cost: number;
      readonly move: Move | null;
      readonly board: Board | null;
      /** False for the +Tube once the level's ad tube is used: the Shop only. */
      readonly adOffered: boolean;
    }
  | { readonly kind: 'confirmRestart' }
  | { readonly kind: 'confirmTube'; readonly payment: TubePayment }
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

/** The completed level `/game?mode=replay&level=N` replays, or null when the param is invalid. */
const replayLevelOf = (level: string | string[] | undefined): number | null => {
  const value = typeof level === 'string' ? Number(level) : NaN;
  return Number.isInteger(value) && value >= 1 ? value : null;
};

/**
 * `/game?mode=daily` plays today's daily challenge, `/game?mode=replay&level=N` replays a
 * completed level; anything else plays the player's level.
 */
const routeModeOf = (mode: string | string[] | undefined, replayLevel: number | null): GameMode => {
  if (mode === 'daily') return 'daily';
  if (mode === 'replay' && replayLevel !== null) return 'replay';
  return 'level';
};

export default function GameScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; level?: string }>();
  const [replayLevel] = useState(() => replayLevelOf(params.level));
  const [routeMode] = useState(() => routeModeOf(params.mode, replayLevel));
  const [today] = useState(() => localToday());
  const mounted = useRef(true);
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
  const [mountUsable] = useState(() =>
    routeMode === 'replay'
      ? false
      : routeMode === 'daily'
        ? isDailyResumable(mountSession, dailyLevelId(today))
        : isResumable(mountSession, useProgressStore.getState().level),
  );

  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [winSequenceDoneFor, setWinSequenceDoneFor] = useState<string | null>(null);
  /** The Win overlay exit that waits behind the notification soft-prompt. */
  const [promptAfter, setPromptAfter] = useState<WinExit | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  /** True while a store review runs between the Win overlay and its exit. */
  const reviewing = useRef(false);
  const [stuckVisible, setStuckVisible] = useState(
    () => mountSession?.status === 'stuck' || mountSession?.pausedFrom === 'stuck',
  );

  const ready = useGameStore(
    (state) =>
      state.session !== null &&
      state.session.mode === routeMode &&
      (state.session !== mountSession || mountUsable),
  );
  const levelId = useGameStore((state) => state.session?.levelId ?? null);
  const levelNumber = useGameStore((state) => state.session?.levelNumber ?? 0);
  const mode = useGameStore((state) => state.session?.mode ?? 'level');
  const status = useGameStore(selectStatus);
  const result = useGameStore((state) => state.session?.result ?? null);
  const canUndo = useGameStore(selectCanUndo);
  const tubesAdded = useGameStore((state) => state.session?.extraTubesAdded ?? 0);
  const adTubeUsed = useGameStore((state) => state.session?.adTubeUsed ?? false);
  const tubeAdUnavailable = useGameStore(selectTubeAdUnavailable);
  const coins = useProgressStore((state) => state.coins);
  const isVip = useProgressStore((state) => state.entitlements.vip);
  const extraTubes = useProgressStore((state) => state.extraTubes);
  const tubeCost = useMemo(
    () =>
      resolveExtraTubeCost({
        tubesAdded,
        adTubeUsed: adTubeUsed || tubeAdUnavailable,
        inventory: extraTubes,
        coins,
        isVip,
      }),
    [tubesAdded, adTubeUsed, tubeAdUnavailable, extraTubes, coins, isVip],
  );
  const tutorialDone = useProgressStore((state) => state.tutorialDone);

  /** The locked chapter whose gate is open (P12.7), or null. */
  const [gateChapter, setGateChapter] = useState<number | null>(() =>
    routeMode === 'level' ? (currentProgressionGate()?.chapter ?? null) : null,
  );
  /** Gated at mount: no level session starts until the chapter opens. */
  const [gatedAtMount] = useState(() => gateChapter !== null);

  useLayoutEffect(() => {
    mounted.current = true;
    if (routeMode === 'daily') ensureDailySession(today, Date.now(), () => mounted.current);
    else if (routeMode === 'replay' && replayLevel !== null) {
      ensureReplaySession(replayLevel, Date.now(), () => mounted.current);
    } else {
      // A locked chapter refuses every route into its levels: the gate shows instead.
      if (!gatedAtMount) ensureLevelSession();
    }
    return () => {
      mounted.current = false;
      // Leaving a replay discards it and brings the player's real slots back.
      if (routeMode === 'replay') game().exitReplay();
      // The +Tube's switch to coins after a failed ad lasts only while the player stays here.
      game().clearTubeAdUnavailable();
    };
  }, [routeMode, today, replayLevel, gatedAtMount]);

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

  /**
   * Pays for `powerUp` with a rewarded ad; an earned unit that no longer applies is banked. When
   * the +Tube ad cannot be shown, a single toast says so and the +Tube controls switch to coins
   * (the flow marks it; the level's ad tube stays unused).
   */
  const runAd = useCallback(
    (powerUp: PowerUp, move: Move | null, board: Board | null) => {
      void withAd(() => buyPowerUpWithAd(powerUp, move, board)).then((outcome) => {
        if (outcome.kind === 'applied') {
          setModal(null);
          play('tap');
        } else if (outcome.kind === 'granted') {
          setModal({ kind: 'reward', reward: outcome.reward });
        } else if (outcome.kind === 'adUnavailable' && powerUp === 'extraTube') {
          showToast('game.tubeAdUnavailable');
        }
      });
    },
    [withAd],
  );

  const handleResult = useCallback(
    (outcome: PowerUpResult, move: Move | null = null, board: Board | null = null) => {
      if (outcome.kind === 'needsPayment' || outcome.kind === 'needsShop') {
        setModal({
          kind: 'notEnough',
          powerUp: outcome.powerUp,
          cost: outcome.cost,
          move,
          board,
          adOffered: outcome.kind === 'needsPayment',
        });
      } else if (outcome.kind === 'needsAd') {
        runAd(outcome.powerUp, move, board);
      } else if (outcome.kind === 'applied') {
        play('tap');
      }
    },
    [runAd],
  );

  const onUndo = useCallback(() => handleResult(activatePowerUp('undo')), [handleResult]);

  /**
   * +Tube: an inventory +Tube or coins are spent only after a confirmation; the level's ad tube
   * plays the ad straight away; no coins and no ad left opens the Shop prompt.
   */
  const onAddTube = useCallback(() => {
    if (!canUse('extraTube')) return;
    const decision = costOf('extraTube');
    if (decision.kind === 'inventory') {
      setModal({ kind: 'confirmTube', payment: { kind: 'inventory', owned: decision.owned } });
    } else if (decision.kind === 'coins') {
      setModal({ kind: 'confirmTube', payment: { kind: 'coins', cost: decision.cost } });
    } else {
      handleResult(activatePowerUp('extraTube'));
    }
  }, [handleResult]);

  const confirmTube = useCallback(() => {
    setModal(null);
    handleResult(activatePowerUp('extraTube'));
  }, [handleResult]);

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
    runAd(modal.powerUp, modal.move, modal.board);
  }, [modal, runAd]);

  const onShop = useCallback(() => {
    setModal(null);
    track('shop_opened', { from: 'not_enough_coins' });
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
    // The next level is in a locked chapter: the gate replaces Next (P12.7).
    const gate = currentProgressionGate();
    if (gate !== null) {
      setGateChapter(gate.chapter);
      return;
    }
    void onNextPressed();
  }, []);

  /** Leaving the gate without unlocking: back to the Win card, or Home when nothing is open. */
  const closeGate = useCallback(() => {
    setGateChapter(null);
    if (game().session?.mode !== 'level' || game().session?.status !== 'won') goHome();
  }, []);

  /** Unlocked: continue into the chapter (Next after a win, or the level this route asked for). */
  const gateUnlocked = useCallback(() => {
    setGateChapter(null);
    const session = game().session;
    if (session?.mode === 'level' && session.status === 'won') void onNextPressed();
    else ensureLevelSession();
  }, []);

  const gateReplay = useCallback((chapter: number) => {
    setGateChapter(null);
    router.replace({ pathname: '/levels', params: { chapter: String(chapter) } });
  }, []);

  const gateShop = useCallback(() => {
    track('shop_opened', { from: 'chapter_gate' });
    router.push('/shop');
  }, []);

  // A win whose stars opened the next chapter says so once.
  const chapterUnlocked = result?.chapterUnlocked;
  useEffect(() => {
    if (chapterUnlocked !== undefined) {
      showToast('chapters.unlocked', { n: formatNumber(chapterUnlocked) });
    }
  }, [chapterUnlocked, levelId]);

  const exitWin = useCallback(
    (exit: WinExit) => {
      if (exit === 'next') onNext();
      else if (exit === 'levels') goBack();
      else goHome();
    },
    [onNext],
  );

  /**
   * Leaving the Win overlay (Next, Home or back). The notification soft-prompt, when due, comes
   * first and the exit continues after the answer. Otherwise a due store review is requested with
   * the Win overlay already hidden, and the exit continues once the review flow returns.
   */
  const leaveWin = useCallback(
    (exit: WinExit) => {
      if (notificationPromptDue()) {
        setPromptAfter(exit);
        return;
      }
      const review = currentReviewInput();
      if (review === null || reviewVerdict(review, Date.now()) !== 'allowed') {
        exitWin(exit);
        return;
      }
      setWinSequenceDoneFor(null);
      reviewing.current = true;
      void requestReviewIfDue(review).finally(() => {
        reviewing.current = false;
        exitWin(exit);
      });
    },
    [exitWin],
  );

  const onWinNext = useCallback(() => leaveWin('next'), [leaveWin]);
  const onWinLevels = useCallback(() => leaveWin('levels'), [leaveWin]);
  const onWinHome = useCallback(() => leaveWin('home'), [leaveWin]);

  const answerPrompt = useCallback(
    (allow: boolean) => {
      if (promptAfter === null || promptBusy) return;
      const exit = promptAfter;
      setPromptBusy(true);
      void answerNotificationPrompt(allow).finally(() => {
        setPromptBusy(false);
        setPromptAfter(null);
        exitWin(exit);
      });
    },
    [promptAfter, promptBusy, exitWin],
  );

  const onPromptAllow = useCallback(() => answerPrompt(true), [answerPrompt]);
  const onPromptNotNow = useCallback(() => answerPrompt(false), [answerPrompt]);

  const onPause = useCallback(() => game().pause(), []);
  const onResume = useCallback(() => game().resume(), []);
  const dismissStuck = useCallback(() => setStuckVisible(false), []);
  const onWinSequenceEnd = useCallback(() => setWinSequenceDoneFor(levelId), [levelId]);
  const toggleFps = useCallback(() => setShowFps((visible) => !visible), []);

  // ---- overlay visibility and hardware back ---------------------------------------------------

  const showStuck = stuckVisible && status === 'stuck';
  const showPause = status === 'paused';
  const showPrompt = promptAfter !== null;
  const showWin =
    status === 'won' &&
    result !== null &&
    !result.skipped &&
    winSequenceDoneFor === levelId &&
    !showPrompt;
  const showSkipped = status === 'won' && result !== null && result.skipped;

  const backAction = useRef<() => void>(() => undefined);
  useEffect(() => {
    backAction.current = () => {
      if (reviewing.current) return;
      if (gateChapter !== null) closeGate();
      else if (modal !== null) setModal(null);
      else if (showPrompt) onPromptNotNow();
      else if (showPause) game().resume();
      else if (showStuck) setStuckVisible(false);
      else if (showSkipped) onNext();
      else if (showWin) onWinHome();
      else if (status === 'won') goHome();
      else game().pause();
    };
  }, [
    gateChapter,
    closeGate,
    modal,
    showPrompt,
    onPromptNotNow,
    showPause,
    showStuck,
    showSkipped,
    showWin,
    onWinHome,
    status,
    onNext,
  ]);

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
  const overlayOpen =
    modal !== null ||
    showPause ||
    showStuck ||
    showWin ||
    showSkipped ||
    showPrompt ||
    gateChapter !== null;
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
      {showWin && result !== null && gateChapter === null ? (
        <WinOverlay
          ui={ui}
          result={result}
          onNext={onWinNext}
          onDouble={onDouble}
          onHome={onWinHome}
          onLevels={onWinLevels}
        />
      ) : null}
      {showPrompt ? (
        <NotificationPromptOverlay
          ui={ui}
          busy={promptBusy}
          onAllow={onPromptAllow}
          onNotNow={onPromptNotNow}
        />
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
          tubeCost={tubeCost}
          busy={busy}
          onUndo={onUndo}
          onAddTube={onAddTube}
          onRestart={onRestart}
          onSkip={mode === 'level' ? onSkip : undefined}
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
          onWatchAd={modal.adOffered ? onWatchAd : undefined}
          onShop={onShop}
          onClose={closeModal}
        />
      ) : null}
      {modal?.kind === 'confirmTube' ? (
        <TubeConfirmOverlay
          ui={ui}
          payment={modal.payment}
          onConfirm={confirmTube}
          onCancel={closeModal}
        />
      ) : null}
      {modal?.kind === 'confirmRestart' ? (
        <RestartConfirmOverlay ui={ui} onConfirm={confirmRestart} onCancel={closeModal} />
      ) : null}
      {gateChapter !== null ? (
        <ChapterGateOverlay
          ui={ui}
          chapter={gateChapter}
          onReplay={gateReplay}
          onUnlocked={gateUnlocked}
          onClose={closeGate}
          onShop={gateShop}
        />
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
