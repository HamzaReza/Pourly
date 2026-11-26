import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Picture,
  Skia,
  usePictureAsTexture,
  type SkPath,
  type Transforms3d,
} from '@shopify/react-native-skia';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { isWon } from '@/game/rules';
import type { Board as GameBoard, Move, PourOutcome, PourResult } from '@/game/types';

import {
  createConfetti,
  effectPrefs,
  shakeOffset,
  winTimeline,
  type Quality,
} from './anim/effects';
import type { PourPlan } from './anim/pour';
import { scaled, SHAKE_MS } from './anim/timing';
import { BubbleLayer, ConfettiLayer, HintGlow, WinGlowLayer } from './EffectLayers';
import { decideTap, isOwned, NO_TAP, withOwned } from './inputQueue';
import { computeBoardLayout, hitTest, SELECTION_LIFT, type Rect, type TubeRect } from './layout';
import { PourSlot, type PourSlotState } from './PourLayer';
import { preparePour, type PourPictureSet } from './pourPictures';
import {
  buildTubePaths,
  createLiquidPaints,
  geometryOf,
  GLOW_BLUR,
  GLOW_STROKE,
  recordBackground,
  recordGlass,
  type CanvasSize,
} from './scene';
import { isSelectable, mirrorBoard, type BoardMirror } from './selection';
import { recordSprites } from './sprites';
import type { Theme } from './themes';
import { TubeLayer, type LiftState } from './TubeLayer';

/** Imperative access for automation (dev stress screen, phase-5 tutorial). */
export interface BoardHandle {
  /** Feeds a tap on tube `index` (-1: empty space) through the same path as a real tap. */
  tap: (index: number) => void;
}

export interface BoardProps {
  board: GameBoard;
  /** Canvas size; the canvas fills its parent. */
  size: CanvasSize;
  /** Where the tubes go, in canvas coordinates (insets and HUD bars already removed). */
  area: Rect;
  theme: Theme;
  colorBlind: boolean;
  /** Effective quality: low drops bubbles, glow blur and half the particles. */
  quality: Quality;
  reducedMotion: boolean;
  /** Pulsing glow on a suggested move's source and destination. */
  hint?: Move | null;
  /** The UI thread changed the selection (-1 = none). */
  onSelect: (index: number) => void;
  /**
   * Commits a pour on the JS board. Called at the start of the pour animation; returns the new
   * board, or null when the pour is not legal on the current board.
   */
  onPour: (from: number, to: number) => PourOutcome | null;
  /** The pour animation started (logical state already committed). */
  onPourStart?: (move: Move, result: PourResult) => void;
  /** The stream ended: the poured liquid has landed. */
  onPourLand?: (move: Move) => void;
  /** A completed tube's cap landed. */
  onTubeComplete?: (index: number) => void;
  /** The selected tube cannot pour into the tapped one. */
  onInvalidMove?: (move: Move) => void;
  /** The win sequence (glow, confetti) started. */
  onWinStart?: () => void;
  /** The win sequence finished; the win overlay can show. */
  onWinSequenceEnd?: () => void;
  /** Every pour animation has finished and none is waiting (the board is at rest). */
  onSettled?: () => void;
  ref?: Ref<BoardHandle>;
}

type BoardEvents = Pick<
  BoardProps,
  | 'onSelect'
  | 'onPourLand'
  | 'onTubeComplete'
  | 'onInvalidMove'
  | 'onWinStart'
  | 'onWinSequenceEnd'
  | 'onSettled'
>;

const LIFT_SPRING = { damping: 15, stiffness: 320, mass: 0.7 } as const;
/** Reduced motion: no spring, durations ×0.4 (spec §8.5.11). */
const REDUCED_LIFT = { duration: 72 } as const;

const EVENT_SELECT = 0;
const EVENT_LAND = 1;
const EVENT_COMPLETE = 2;
const EVENT_INVALID = 3;
const EVENT_WIN_START = 4;
const EVENT_WIN_END = 5;
const EVENT_SETTLED = 6;

/** Pour milestones (bit flags; several can fall on the same millisecond). */
const MARK_STREAM = 1;
const MARK_CAP = 2;
const MARK_SOURCE = 4;
const MARK_TARGET = 8;
const MARK_END = 16;

const usePourSlotState = (): PourSlotState => {
  const plan = useSharedValue<PourPlan | null>(null);
  const pictures = useSharedValue<PourPictureSet | null>(null);
  const clock = useSharedValue(0);
  return useMemo(() => ({ plan, pictures, clock }), [plan, pictures, clock]);
};

interface JsContext {
  readonly onPour: BoardProps['onPour'];
  readonly onPourStart: BoardProps['onPourStart'];
  readonly layout: ReturnType<typeof computeBoardLayout>;
  readonly paths: ReturnType<typeof buildTubePaths>;
  readonly paints: ReturnType<typeof createLiquidPaints>;
  readonly colorBlind: boolean;
  readonly canvasWidth: number;
  readonly durationScale: number;
}

interface UiOps {
  readonly startPour: (
    slot: number,
    plan: PourPlan,
    pictures: PourPictureSet,
    mirror: BoardMirror,
    won: boolean,
  ) => void;
  readonly commitInstantly: (slot: number, mirror: BoardMirror, won: boolean) => void;
  readonly abortPour: (slot: number) => void;
}

const BoardComponent = ({
  board,
  size,
  area,
  theme,
  colorBlind,
  quality,
  reducedMotion,
  hint = null,
  onSelect,
  onPour,
  onPourStart,
  onPourLand,
  onTubeComplete,
  onInvalidMove,
  onWinStart,
  onWinSequenceEnd,
  onSettled,
  ref,
}: BoardProps) => {
  const { capacity } = board;
  const tubeCount = board.tubes.length;
  const prefs = useMemo(() => effectPrefs(quality, reducedMotion), [quality, reducedMotion]);
  const scale = prefs.durationScale;

  const layout = useMemo(
    () =>
      computeBoardLayout({
        area: { x: area.x, y: area.y, width: area.width, height: area.height },
        tubeCount,
        capacity,
      }),
    [area.x, area.y, area.width, area.height, tubeCount, capacity],
  );
  const geometry = useMemo(() => geometryOf(layout, capacity), [layout, capacity]);
  const paths = useMemo(() => buildTubePaths(Skia, geometry), [geometry]);
  const paints = useMemo(() => createLiquidPaints(Skia, geometry), [geometry]);
  const glass = useMemo(() => recordGlass(Skia, paths, theme.tube), [paths, theme.tube]);
  const background = useMemo(
    () => recordBackground(Skia, { width: size.width, height: size.height }, theme, layout),
    [size.width, size.height, theme, layout],
  );
  const emptyPath = useMemo(() => Skia.Path.Make(), []);
  const emptyPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    return recorder.finishRecordingAsPicture();
  }, []);
  const sprites = useMemo(() => recordSprites(Skia), []);
  const spriteSize = useMemo(() => ({ width: sprites.width, height: sprites.height }), [sprites]);
  const texture = usePictureAsTexture(sprites.picture, spriteSize);
  const timeline = useMemo(
    () => winTimeline(tubeCount, prefs.confetti, scale),
    [tubeCount, prefs.confetti, scale],
  );
  const confetti = useMemo(() => createConfetti(prefs.confetti), [prefs.confetti]);

  const upIndex = useSharedValue(-1);
  const upProgress = useSharedValue(0);
  const downIndex = useSharedValue(-1);
  const downProgress = useSharedValue(0);
  const shakeIndex = useSharedValue(-1);
  const shakeProgress = useSharedValue(0);
  const shakeNext = useSharedValue(-1);
  const shaking = useSharedValue(false);
  const mirror = useSharedValue(() => mirrorBoard(board));
  const rects = useSharedValue<readonly TubeRect[]>(layout.tubes);
  const ownedMask = useSharedValue(0);
  const pendingSlot = useSharedValue(-1);
  const streaming = useSharedValue(0);
  const queuedTap = useSharedValue(NO_TAP);
  const replayTick = useSharedValue(0);
  const epoch = useSharedValue(0);
  const winPending = useSharedValue(false);
  const winClock = useSharedValue(-1);
  const slotA = usePourSlotState();
  const slotB = usePourSlotState();
  const lift = useMemo<LiftState>(
    () => ({ upIndex, upProgress, downIndex, downProgress, shakeIndex, shakeProgress }),
    [upIndex, upProgress, downIndex, downProgress, shakeIndex, shakeProgress],
  );

  useEffect(() => {
    rects.set(layout.tubes);
  }, [layout, rects]);

  const events = useRef<BoardEvents>({ onSelect });
  const jsContext = useRef<JsContext | null>(null);
  const uiOps = useRef<UiOps | null>(null);
  const boardRef = useRef(board);
  const epochRef = useRef(0);

  useEffect(() => {
    events.current = {
      onSelect,
      onPourLand,
      onTubeComplete,
      onInvalidMove,
      onWinStart,
      onWinSequenceEnd,
      onSettled,
    };
  }, [
    onSelect,
    onPourLand,
    onTubeComplete,
    onInvalidMove,
    onWinStart,
    onWinSequenceEnd,
    onSettled,
  ]);

  useEffect(() => {
    jsContext.current = {
      onPour,
      onPourStart,
      layout,
      paths,
      paints,
      colorBlind,
      canvasWidth: size.width,
      durationScale: scale,
    };
  }, [onPour, onPourStart, layout, paths, paints, colorBlind, size.width, scale]);

  /** JS side of every UI-thread event; reads the latest callbacks, so it never changes. */
  const emit = useCallback((event: number, a: number, b: number) => {
    const handlers = events.current;
    switch (event) {
      case EVENT_SELECT:
        handlers.onSelect(a);
        return;
      case EVENT_LAND:
        handlers.onPourLand?.({ from: a, to: b });
        return;
      case EVENT_COMPLETE:
        handlers.onTubeComplete?.(a);
        return;
      case EVENT_INVALID:
        handlers.onInvalidMove?.({ from: a, to: b });
        return;
      case EVENT_WIN_START:
        handlers.onWinStart?.();
        return;
      case EVENT_WIN_END:
        handlers.onWinSequenceEnd?.();
        return;
      case EVENT_SETTLED:
        handlers.onSettled?.();
        return;
    }
  }, []);

  /**
   * JS half of a pour: commit the logical state first (spec §9), then build the plan and the
   * pictures once and hand them to the UI thread, which starts the animation.
   */
  const handlePour = useCallback(
    (slot: number, from: number, to: number, tapEpoch: number) => {
      const context = jsContext.current;
      const ops = uiOps.current;
      if (context === null || ops === null || tapEpoch !== epochRef.current) return;
      const before = boardRef.current;
      const outcome = context.onPour(from, to);
      if (outcome === null) {
        scheduleOnUI(ops.abortPour, slot);
        return;
      }
      boardRef.current = outcome.board;
      const nextMirror = mirrorBoard(outcome.board);
      const won = isWon(outcome.board);
      const prepared = preparePour(Skia, {
        before,
        after: outcome.board,
        move: { from, to },
        result: outcome.result,
        layout: context.layout,
        paths: context.paths,
        paints: context.paints,
        colorBlind: context.colorBlind,
        canvasWidth: context.canvasWidth,
        durationScale: context.durationScale,
        empty: emptyPicture,
      });
      if (prepared === null) scheduleOnUI(ops.commitInstantly, slot, nextMirror, won);
      else scheduleOnUI(ops.startPour, slot, prepared.plan, prepared.pictures, nextMirror, won);
      context.onPourStart?.({ from, to }, outcome.result);
    },
    [emptyPicture],
  );

  const controller = useMemo(() => {
    const slotAt = (index: number): PourSlotState => {
      'worklet';
      return index === 0 ? slotA : slotB;
    };
    const animateLift = (target: number): number => {
      'worklet';
      return reducedMotion ? withTiming(target, REDUCED_LIFT) : withSpring(target, LIFT_SPRING);
    };
    const lower = (): void => {
      'worklet';
      if (upIndex.get() < 0) return;
      downIndex.set(upIndex.get());
      downProgress.set(upProgress.get());
      downProgress.set(animateLift(0));
      upIndex.set(-1);
      upProgress.set(0);
    };
    const raise = (index: number): void => {
      'worklet';
      const start = downIndex.get() === index ? downProgress.get() : 0;
      if (downIndex.get() === index) downIndex.set(-1);
      lower();
      upIndex.set(index);
      upProgress.set(start);
      upProgress.set(animateLift(1));
    };
    /** Removes the selection lift from `index` at once (the pour layer takes the tube over). */
    const dropSelection = (index: number): void => {
      'worklet';
      if (upIndex.get() === index) {
        cancelAnimation(upProgress);
        upIndex.set(-1);
        upProgress.set(0);
      }
      if (downIndex.get() === index) {
        cancelAnimation(downProgress);
        downIndex.set(-1);
        downProgress.set(0);
      }
    };
    /** Asks the replay reaction to retry the queued tap. */
    const wake = (): void => {
      'worklet';
      replayTick.set(replayTick.get() + 1);
    };
    const endShake = (): void => {
      'worklet';
      const next = shakeNext.get();
      shaking.set(false);
      shakeIndex.set(-1);
      shakeProgress.set(0);
      shakeNext.set(-1);
      if (next >= 0 && !isOwned(ownedMask.get(), next) && isSelectable(mirror.get(), next)) {
        raise(next);
        scheduleOnRN(emit, EVENT_SELECT, next, 0);
      } else {
        lower();
        scheduleOnRN(emit, EVENT_SELECT, -1, 0);
      }
      wake();
    };
    const freeSlot = (): number => {
      'worklet';
      for (let index = 0; index < 2; index += 1) {
        if (slotAt(index).plan.get() === null && pendingSlot.get() !== index) return index;
      }
      return -1;
    };
    const process = (tapped: number): void => {
      'worklet';
      const decision = decideTap(
        mirror.get(),
        {
          selected: upIndex.get(),
          ownedMask: ownedMask.get(),
          pending: pendingSlot.get() >= 0,
          streaming: streaming.get() > 0,
          freeSlot: freeSlot() >= 0,
          shaking: shaking.get(),
        },
        tapped,
      );
      if (decision.kind === 'queue') {
        queuedTap.set(tapped);
        return;
      }
      const outcome = decision.outcome;
      switch (outcome.kind) {
        case 'none':
          return;
        case 'select':
          raise(outcome.index);
          scheduleOnRN(emit, EVENT_SELECT, outcome.index, 0);
          return;
        case 'deselect':
          lower();
          scheduleOnRN(emit, EVENT_SELECT, -1, 0);
          return;
        case 'pour': {
          const slot = freeSlot();
          pendingSlot.set(slot);
          scheduleOnRN(handlePour, slot, outcome.from, outcome.to, epoch.get());
          return;
        }
        case 'invalid':
          shaking.set(true);
          shakeIndex.set(outcome.from);
          shakeNext.set(outcome.next);
          shakeProgress.set(0);
          shakeProgress.set(
            withTiming(1, { duration: scaled(SHAKE_MS, scale), easing: Easing.linear }, (done) => {
              if (done === true) endShake();
            }),
          );
          scheduleOnRN(emit, EVENT_INVALID, outcome.from, outcome.to);
          return;
      }
    };
    /** Reports a board at rest once no pour is animating or waiting for its commit. */
    const maybeSettled = (): void => {
      'worklet';
      if (pendingSlot.get() >= 0) return;
      if (slotA.plan.get() !== null || slotB.plan.get() !== null) return;
      scheduleOnRN(emit, EVENT_SETTLED, 0, 0);
    };
    const maybeStartWin = (): void => {
      'worklet';
      if (!winPending.get() || pendingSlot.get() >= 0) return;
      if (slotA.plan.get() !== null || slotB.plan.get() !== null) return;
      winPending.set(false);
      winClock.set(0);
      scheduleOnRN(emit, EVENT_WIN_START, 0, 0);
      winClock.set(
        withTiming(timeline.total, { duration: timeline.total, easing: Easing.linear }, (done) => {
          if (done === true) scheduleOnRN(emit, EVENT_WIN_END, 0, 0);
        }),
      );
    };
    const milestone = (slotIndex: number, flags: number): void => {
      'worklet';
      const slot = slotAt(slotIndex);
      const plan = slot.plan.get();
      if (plan === null) return;
      if ((flags & MARK_STREAM) !== 0) {
        streaming.set(Math.max(0, streaming.get() - 1));
        scheduleOnRN(emit, EVENT_LAND, plan.from, plan.to);
      }
      if ((flags & MARK_CAP) !== 0) scheduleOnRN(emit, EVENT_COMPLETE, plan.to, 0);
      let mask = ownedMask.get();
      if ((flags & MARK_SOURCE) !== 0) mask = withOwned(mask, plan.from, false);
      if ((flags & MARK_TARGET) !== 0) mask = withOwned(mask, plan.to, false);
      ownedMask.set(mask);
      if ((flags & MARK_END) !== 0) {
        slot.plan.set(null);
        slot.pictures.set(null);
        slot.clock.set(0);
        maybeSettled();
        maybeStartWin();
      }
      wake();
    };
    const startPour = (
      slotIndex: number,
      plan: PourPlan,
      pictures: PourPictureSet,
      nextMirror: BoardMirror,
      won: boolean,
    ): void => {
      'worklet';
      if (pendingSlot.get() !== slotIndex) return;
      pendingSlot.set(-1);
      const startLift = upIndex.get() === plan.from ? upProgress.get() * SELECTION_LIFT : 0;
      dropSelection(plan.from);
      mirror.set(nextMirror);
      ownedMask.set(withOwned(withOwned(ownedMask.get(), plan.from, true), plan.to, true));
      if (won) winPending.set(true);
      streaming.set(streaming.get() + 1);
      const slot = slotAt(slotIndex);
      slot.pictures.set(pictures);
      slot.plan.set({ ...plan, startLift });
      slot.clock.set(0);

      const t = plan.times;
      const marks: { at: number; flags: number }[] = [];
      const mark = (at: number, flags: number): void => {
        const existing = marks.find((entry) => entry.at === at);
        if (existing !== undefined) existing.flags |= flags;
        else marks.push({ at, flags });
      };
      mark(t.streamEnd, MARK_STREAM);
      if (plan.completes) mark(t.capImpact, MARK_CAP);
      mark(t.sourceRelease, MARK_SOURCE);
      mark(t.targetRelease, MARK_TARGET);
      marks.sort((first, second) => first.at - second.at);
      const last = marks[marks.length - 1];
      if (last !== undefined) last.flags |= MARK_END;
      let previous = 0;
      const steps = marks.map((entry) => {
        const duration = Math.max(0, entry.at - previous);
        previous = entry.at;
        return withTiming(entry.at, { duration, easing: Easing.linear }, (done) => {
          if (done === true) milestone(slotIndex, entry.flags);
        });
      });
      slot.clock.set(withSequence(...steps));
    };
    const commitInstantly = (slotIndex: number, nextMirror: BoardMirror, won: boolean): void => {
      'worklet';
      if (pendingSlot.get() !== slotIndex) return;
      pendingSlot.set(-1);
      dropSelection(upIndex.get());
      mirror.set(nextMirror);
      if (won) winPending.set(true);
      maybeSettled();
      maybeStartWin();
      wake();
    };
    const abortPour = (slotIndex: number): void => {
      'worklet';
      if (pendingSlot.get() !== slotIndex) return;
      pendingSlot.set(-1);
      lower();
      scheduleOnRN(emit, EVENT_SELECT, -1, 0);
      wake();
    };
    const reset = (nextMirror: BoardMirror, nextEpoch: number): void => {
      'worklet';
      for (let index = 0; index < 2; index += 1) {
        const slot = slotAt(index);
        cancelAnimation(slot.clock);
        slot.plan.set(null);
        slot.pictures.set(null);
        slot.clock.set(0);
      }
      cancelAnimation(shakeProgress);
      cancelAnimation(upProgress);
      cancelAnimation(downProgress);
      cancelAnimation(winClock);
      shaking.set(false);
      shakeIndex.set(-1);
      shakeProgress.set(0);
      shakeNext.set(-1);
      upIndex.set(-1);
      upProgress.set(0);
      downIndex.set(-1);
      downProgress.set(0);
      winPending.set(false);
      winClock.set(-1);
      ownedMask.set(0);
      pendingSlot.set(-1);
      streaming.set(0);
      queuedTap.set(NO_TAP);
      mirror.set(nextMirror);
      epoch.set(nextEpoch);
    };
    return { process, startPour, commitInstantly, abortPour, reset };
  }, [
    reducedMotion,
    scale,
    timeline,
    emit,
    handlePour,
    slotA,
    slotB,
    upIndex,
    upProgress,
    downIndex,
    downProgress,
    shakeIndex,
    shakeProgress,
    shakeNext,
    shaking,
    mirror,
    ownedMask,
    pendingSlot,
    streaming,
    queuedTap,
    replayTick,
    epoch,
    winPending,
    winClock,
  ]);

  useEffect(() => {
    uiOps.current = controller;
  }, [controller]);

  useAnimatedReaction(
    () => replayTick.get(),
    (tick, previous) => {
      if (previous === null || tick === previous) return;
      const tapped = queuedTap.get();
      if (tapped === NO_TAP) return;
      queuedTap.set(NO_TAP);
      controller.process(tapped);
    },
  );

  // A board that did not come from our own pour (restart, undo, new level) resets every animation.
  useEffect(() => {
    if (board === boardRef.current) return;
    boardRef.current = board;
    epochRef.current += 1;
    scheduleOnUI(controller.reset, mirrorBoard(board), epochRef.current);
  }, [board, controller]);

  useImperativeHandle(
    ref,
    () => ({
      tap: (index: number) => scheduleOnUI(controller.process, index),
    }),
    [controller],
  );

  const tapConfig = useMemo(
    () => ({
      onActivate: (event: { x: number; y: number }) => {
        'worklet';
        controller.process(hitTest(rects.get(), event.x, event.y));
      },
    }),
    [controller, rects],
  );
  const tap = useTapGesture(tapConfig);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <GestureDetector gesture={tap}>
        <Canvas style={styles.canvas}>
          <Picture picture={background} />
          {prefs.bubbles > 0 ? (
            <BubbleLayer
              width={size.width}
              height={size.height}
              texture={texture}
              sprite={sprites.bubble}
            />
          ) : null}
          <WinGlowLayer
            rects={layout.tubes}
            outline={paths.outline}
            empty={emptyPath}
            color={theme.glow}
            blur={prefs.glowBlur}
            clock={winClock}
            timeline={timeline}
          />
          {hint !== null ? (
            <HintGlow
              hint={hint}
              rects={layout.tubes}
              outline={paths.outline}
              empty={emptyPath}
              color={theme.glow}
              blur={prefs.glowBlur}
              lift={lift}
              durationScale={scale}
            />
          ) : null}
          {prefs.selectionGlow ? (
            <SelectionGlow
              color={theme.glow}
              outline={paths.outline}
              empty={emptyPath}
              rects={rects}
              lift={lift}
            />
          ) : null}
          {board.tubes.map((tube, index) => {
            const rect = layout.tubes[index];
            if (rect === undefined) return null;
            return (
              <TubeLayer
                key={index}
                index={index}
                tube={tube}
                x={rect.drawn.x}
                y={rect.drawn.y}
                paths={paths}
                glass={glass}
                paints={paints}
                colorBlind={colorBlind}
                lift={lift}
                ownedMask={ownedMask}
                empty={emptyPicture}
              />
            );
          })}
          <PourSlot
            slot={slotA}
            paths={paths}
            glass={glass}
            empty={emptyPicture}
            texture={texture}
            sparkleSprite={sprites.sparkle}
            sparkles={prefs.sparkles}
          />
          <PourSlot
            slot={slotB}
            paths={paths}
            glass={glass}
            empty={emptyPicture}
            texture={texture}
            sparkleSprite={sprites.sparkle}
            sparkles={prefs.sparkles}
          />
          {prefs.confetti > 0 ? (
            <ConfettiLayer
              particles={confetti}
              clock={winClock}
              timeline={timeline}
              width={size.width}
              height={size.height}
              texture={texture}
              sprites={sprites.confetti}
            />
          ) : null}
        </Canvas>
      </GestureDetector>
    </View>
  );
};

interface SelectionGlowProps {
  color: string;
  outline: SkPath;
  empty: SkPath;
  rects: SharedValue<readonly TubeRect[]>;
  lift: LiftState;
}

/** Soft ring around the selected tube only; draws an empty path when nothing is selected. */
const SelectionGlowComponent = ({ color, outline, empty, rects, lift }: SelectionGlowProps) => {
  const { upIndex, upProgress, shakeIndex, shakeProgress } = lift;
  const path = useDerivedValue(() => (upIndex.get() >= 0 ? outline : empty));
  const opacity = useDerivedValue(() => Math.min(1, Math.max(0, upProgress.get())));
  const transform = useDerivedValue<Transforms3d>(() => {
    const index = upIndex.get();
    const rect = rects.get()[index];
    if (rect === undefined) return [{ translateX: 0 }, { translateY: 0 }];
    const shake = shakeIndex.get() === index ? shakeOffset(shakeProgress.get()) : 0;
    return [
      { translateX: rect.drawn.x + shake },
      { translateY: rect.drawn.y - upProgress.get() * SELECTION_LIFT },
    ];
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={GLOW_STROKE} color={color}>
        <BlurMask blur={GLOW_BLUR} style="normal" />
      </Path>
    </Group>
  );
};

const SelectionGlow = memo(SelectionGlowComponent);

export const BoardView = memo(BoardComponent);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    direction: 'ltr',
  },
  canvas: {
    flex: 1,
  },
});
