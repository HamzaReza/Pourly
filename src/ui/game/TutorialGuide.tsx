import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import {
  INITIAL_TUTORIAL,
  reduceTutorial,
  TUTORIAL_IDLE_DELAY_MS,
  TUTORIAL_NEXT_DELAY_MS,
  type TutorialEvent,
  type TutorialState,
} from '@/game/tutorial';
import type { Board } from '@/game/types';
import { computeBoardLayout, type Rect } from '@/render/layout';
import type { ThemeUi } from '@/render/themes';
import { useHintSearch } from '@/render/useHint';
import { track } from '@/services/analytics';
import { surfaceColors } from '@/ui/theme';
import { fontSizes, fontWeights, radii, spacing } from '@/ui/tokens';

import type { BoardEvents } from './boardEvents';
import { Text } from '@/ui/Text';

const CAPTIONS = {
  1: 'tutorial.level1',
  2: 'tutorial.level2',
  3: 'tutorial.level3',
} as const;

const RING_SIZE = 46;
const FINGER_WIDTH = 22;
const FINGER_HEIGHT = 58;
const MOVE_MS = 280;
const BOB_MS = 460;
const BOB_DISTANCE = 10;
const FINGER_COLOR = '#FFFFFF';
const FINGER_EDGE = 'rgba(10, 20, 40, 0.55)';

export interface TutorialGuideProps {
  board: Board;
  area: Rect;
  level: number;
  events: BoardEvents;
  reducedMotion: boolean;
  ui: ThemeUi;
}

/** Point (canvas coordinates) the finger tip touches on tube `index`. */
const tipFor = (board: Board, area: Rect, index: number): { x: number; y: number } | null => {
  const layout = computeBoardLayout({
    area,
    tubeCount: board.tubes.length,
    capacity: board.capacity,
  });
  const rect = layout.tubes[index]?.drawn;
  if (rect === undefined) return null;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.4 };
};

/**
 * Levels 1–3 guide: a text-free finger points at the solver's suggested source, then at its
 * destination, with one short caption. It advances after each correct pour and hides after a
 * wrong move until the player has been idle for a moment. Drawn with views (no images); reduced
 * motion keeps it still.
 */
const TutorialGuideComponent = ({
  board,
  area,
  level,
  events,
  reducedMotion,
  ui,
}: TutorialGuideProps) => {
  const { t } = useTranslation();
  const requestHint = useHintSearch(board);
  const [state, setState] = useState<TutorialState>(INITIAL_TUTORIAL);
  const stateRef = useRef(state);
  const selectedRef = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOutcome = useRef<'correct' | 'wrong'>('correct');
  /** A pour event arrived; the next board change is that pour, not an undo or restart. */
  const pourPending = useRef(false);
  const lastBoard = useRef(board);
  const restartGuide = useRef<(() => void) | null>(null);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const bob = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    const dispatch = (event: TutorialEvent): 'none' | 'correct' | 'wrong' => {
      const transition = reduceTutorial(stateRef.current, event);
      stateRef.current = transition.state;
      setState(transition.state);
      return transition.outcome;
    };
    const suggestAfter = (delayMs: number): void => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        requestHint().then((move) => {
          if (alive) dispatch({ type: 'suggest', move, selected: selectedRef.current });
        });
      }, delayMs);
    };
    suggestAfter(TUTORIAL_NEXT_DELAY_MS);
    restartGuide.current = () => {
      selectedRef.current = -1;
      lastOutcome.current = 'correct';
      dispatch({ type: 'suggest', move: null, selected: -1 });
      suggestAfter(TUTORIAL_NEXT_DELAY_MS);
    };
    const unsubscribe = events.subscribe((event) => {
      switch (event.type) {
        case 'select': {
          selectedRef.current = event.index;
          const hiddenBefore = stateRef.current.phase === 'hidden';
          const outcome = dispatch(event);
          if (outcome === 'wrong' || (hiddenBefore && timer.current !== null)) {
            lastOutcome.current = 'wrong';
            suggestAfter(TUTORIAL_IDLE_DELAY_MS);
          }
          return;
        }
        case 'pour': {
          selectedRef.current = -1;
          pourPending.current = true;
          const before = stateRef.current.step;
          const outcome = dispatch(event);
          if (outcome === 'correct') {
            lastOutcome.current = 'correct';
            track('tutorial_step', { level, step: before + 1 });
          } else {
            lastOutcome.current = 'wrong';
          }
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = null;
          return;
        }
        case 'invalid':
          dispatch(event);
          lastOutcome.current = 'wrong';
          suggestAfter(TUTORIAL_IDLE_DELAY_MS);
          return;
        case 'settled':
          if (stateRef.current.phase !== 'hidden') return;
          suggestAfter(
            lastOutcome.current === 'correct' ? TUTORIAL_NEXT_DELAY_MS : TUTORIAL_IDLE_DELAY_MS,
          );
          return;
      }
    });
    return () => {
      alive = false;
      restartGuide.current = null;
      unsubscribe();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [events, requestHint, level]);

  // An undo or restart replaced the board without a pour: start guiding from the new board.
  useEffect(() => {
    if (board === lastBoard.current) return;
    lastBoard.current = board;
    if (pourPending.current) {
      pourPending.current = false;
      return;
    }
    restartGuide.current?.();
  }, [board]);

  const target = useMemo(() => {
    const { move, phase } = state;
    if (move === null || phase === 'hidden') return null;
    return tipFor(board, area, phase === 'source' ? move.from : move.to);
  }, [state, board, area]);

  const visible = target !== null;
  const targetX = target?.x ?? 0;
  const targetY = target?.y ?? 0;

  useEffect(() => {
    if (!visible) {
      opacity.set(withTiming(0, { duration: 120 }));
      return;
    }
    const wasHidden = opacity.get() < 0.5;
    if (reducedMotion || wasHidden) {
      x.set(targetX);
      y.set(targetY);
    } else {
      x.set(withTiming(targetX, { duration: MOVE_MS, easing: Easing.inOut(Easing.cubic) }));
      y.set(withTiming(targetY, { duration: MOVE_MS, easing: Easing.inOut(Easing.cubic) }));
    }
    opacity.set(withTiming(1, { duration: reducedMotion ? 0 : 160 }));
  }, [visible, targetX, targetY, reducedMotion, opacity, x, y]);

  useEffect(() => {
    if (reducedMotion || !visible) {
      cancelAnimation(bob);
      cancelAnimation(ring);
      bob.set(0);
      ring.set(reducedMotion ? 0.5 : 0);
      return;
    }
    bob.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: BOB_MS, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: BOB_MS, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    ring.set(0);
    ring.set(
      withRepeat(withTiming(1, { duration: BOB_MS * 2, easing: Easing.out(Easing.quad) }), -1),
    );
  }, [reducedMotion, visible, bob, ring]);

  const fingerStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() + bob.get() * BOB_DISTANCE }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.6 : 0.9 * (1 - ring.get()),
    transform: [{ scale: reducedMotion ? 1 : 0.5 + ring.get() * 0.8 }],
  }));

  const caption = level === 1 || level === 2 || level === 3 ? CAPTIONS[level] : undefined;

  return (
    <View pointerEvents="none" style={styles.root}>
      {caption !== undefined ? (
        <View
          style={[
            styles.caption,
            {
              top: area.y + spacing.sm,
              backgroundColor: ui.surface,
              borderColor: surfaceColors(ui).accentBorder,
            },
          ]}
        >
          <Text
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            style={[styles.captionText, { color: ui.text }]}
          >
            {t(caption)}
          </Text>
        </View>
      ) : null}
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.finger, fingerStyle]}
      >
        <Animated.View style={[styles.ring, { borderColor: ui.accent }, ringStyle]} />
        <View style={styles.fingerBody}>
          <View style={styles.nail} />
        </View>
      </Animated.View>
    </View>
  );
};

export const TutorialGuide = memo(TutorialGuideComponent);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    direction: 'ltr',
  },
  caption: {
    position: 'absolute',
    start: spacing.lg,
    end: spacing.lg,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + spacing.xxs,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  captionText: {
    fontSize: fontSizes.callout,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
  finger: {
    position: 'absolute',
    top: 0,
    start: 0,
    width: 0,
    height: 0,
  },
  ring: {
    position: 'absolute',
    top: -RING_SIZE / 2,
    start: -RING_SIZE / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
  },
  fingerBody: {
    position: 'absolute',
    top: 0,
    start: -FINGER_WIDTH / 2 + 6,
    width: FINGER_WIDTH,
    height: FINGER_HEIGHT,
    borderRadius: FINGER_WIDTH / 2,
    backgroundColor: FINGER_COLOR,
    borderWidth: 2,
    borderColor: FINGER_EDGE,
    alignItems: 'center',
    paddingTop: 4,
    transform: [{ rotate: '-24deg' }],
    transformOrigin: 'top',
  },
  nail: {
    width: FINGER_WIDTH - 10,
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(10, 20, 40, 0.18)',
  },
});
