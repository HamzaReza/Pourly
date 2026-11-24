import { Redirect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPACITY, MAX_TUBES, PALETTE_SIZE } from '@/config/game';
import { createRng, shuffle } from '@/game/rng';
import { isPointlessMove, isWon, legalMoves } from '@/game/rules';
import type { Board, Segment } from '@/game/types';
import { BoardView, type BoardHandle } from '@/render/Board';
import type { Rect } from '@/render/layout';
import type { CanvasSize } from '@/render/scene';
import { getTheme } from '@/render/themes';
import { useBoardState } from '@/render/useBoardState';
import { useRenderSettings } from '@/render/useRenderSettings';
import { FpsOverlay } from '@/ui/FpsOverlay';
import { IconButton } from '@/ui/IconButton';
import { goBack } from '@/ui/Screen';
import { colors, fontSizes, MIN_TOUCH_TARGET, spacing } from '@/ui/tokens';

/** One automatic move (select + destination tap) per tick. */
const MOVE_INTERVAL_MS = 420;
const EMPTY_TUBES = MAX_TUBES - PALETTE_SIZE;

/** 14 colors × 4 segments shuffled into 14 tubes, plus 2 empty tubes: 16 tubes (spec §8.5.10). */
const stressBoard = (seed: number): Board => {
  const rng = createRng(seed);
  const segments: Segment[] = [];
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    for (let i = 0; i < CAPACITY; i += 1) segments.push({ color, hidden: false });
  }
  const dealt = shuffle(rng, segments);
  const tubes: Segment[][] = [];
  for (let t = 0; t < PALETTE_SIZE; t += 1) {
    tubes.push(
      dealt.slice(t * CAPACITY, (t + 1) * CAPACITY).map((segment, index) => ({
        color: segment.color,
        hidden: index < CAPACITY - 1 && rng.next() < 0.25,
      })),
    );
  }
  for (let t = 0; t < EMPTY_TUBES; t += 1) tubes.push([]);
  return { tubes, capacity: CAPACITY };
};

interface StressRoundProps {
  seed: number;
  size: CanvasSize;
  area: Rect;
  onFinished: () => void;
}

/** Plays random non-pointless pours through the board's tap path until the board is stuck or won. */
const StressRound = ({ seed, size, area, onFinished }: StressRoundProps) => {
  const initial = useMemo(() => stressBoard(seed), [seed]);
  const { board, setSelected, commitPour } = useBoardState(initial);
  const { colorBlind, quality, reducedMotion } = useRenderSettings();
  const boardHandle = useRef<BoardHandle>(null);
  const boardRef = useRef(board);
  const rng = useMemo(() => createRng(seed ^ 0x5a5a), [seed]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = boardRef.current;
      const moves = legalMoves(current).filter((move) => !isPointlessMove(current, move));
      const move = moves.length > 0 ? moves[rng.int(moves.length)] : undefined;
      if (move === undefined || isWon(current)) {
        onFinished();
        return;
      }
      boardHandle.current?.tap(move.from);
      boardHandle.current?.tap(move.to);
    }, MOVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rng, onFinished]);

  return (
    <BoardView
      ref={boardHandle}
      board={board}
      size={size}
      area={area}
      theme={getTheme('classic')}
      colorBlind={colorBlind}
      quality={quality}
      reducedMotion={reducedMotion}
      onSelect={setSelected}
      onPour={commitPour}
    />
  );
};

const DevStress = () => {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<CanvasSize | null>(null);
  const [round, setRound] = useState(1);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);
  const nextRound = useCallback(() => setRound((value) => value + 1), []);

  const area = useMemo<Rect | null>(() => {
    if (size === null) return null;
    const top = insets.top + MIN_TOUCH_TARGET + spacing.md;
    return {
      x: insets.left + spacing.sm,
      y: top,
      width: Math.max(0, size.width - insets.left - insets.right - spacing.sm * 2),
      height: Math.max(0, size.height - top - insets.bottom - spacing.lg),
    };
  }, [size, insets.left, insets.top, insets.right, insets.bottom]);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size !== null && area !== null ? (
        <StressRound key={round} seed={round} size={size} area={area} onFinished={nextRound} />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[styles.bar, { top: insets.top, start: insets.left + spacing.sm }]}
      >
        <IconButton icon="close" accessibilityLabel="Close" onPress={goBack} />
        <Text style={styles.label}>{`Stress · round ${round}`}</Text>
        <FpsOverlay />
      </View>
    </View>
  );
};

/** Dev-only stress screen (spec §8.5.10). Release builds redirect home. */
export default function DevStressScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DevStress />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: getTheme('classic').background[0],
  },
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: MIN_TOUCH_TARGET + spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: fontSizes.small,
  },
});
