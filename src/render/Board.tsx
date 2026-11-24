import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Picture,
  Skia,
  type SkPath,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Board as GameBoard } from '@/game/types';

import { computeBoardLayout, hitTest, SELECTION_LIFT, type Rect, type TubeRect } from './layout';
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
import { mirrorBoard, resolveTap } from './selection';
import type { Theme } from './themes';
import { TubeLayer, type LiftState } from './TubeLayer';

export interface BoardProps {
  board: GameBoard;
  /** Canvas size; the canvas fills its parent. */
  size: CanvasSize;
  /** Where the tubes go, in canvas coordinates (insets and HUD bars already removed). */
  area: Rect;
  theme: Theme;
  colorBlind: boolean;
  /** Selection glow (off in low quality). */
  glow: boolean;
  reducedMotion: boolean;
  /** Called on the JS thread after the UI thread changed the selection (-1 = none). */
  onSelect: (index: number) => void;
  /** Called on the JS thread for a valid-looking pour; returns whether the board accepted it. */
  onPour: (from: number, to: number) => boolean;
}

const LIFT_SPRING = { damping: 15, stiffness: 320, mass: 0.7 } as const;
/** Reduced motion: no spring, durations ×0.4 (spec §8.5.11). */
const REDUCED_LIFT = { duration: 72 } as const;

const BoardComponent = ({
  board,
  size,
  area,
  theme,
  colorBlind,
  glow,
  reducedMotion,
  onSelect,
  onPour,
}: BoardProps) => {
  const { capacity } = board;
  const tubeCount = board.tubes.length;

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

  const upIndex = useSharedValue(-1);
  const upProgress = useSharedValue(0);
  const downIndex = useSharedValue(-1);
  const downProgress = useSharedValue(0);
  const busy = useSharedValue(false);
  const mirror = useSharedValue(() => mirrorBoard(board));
  const rects = useSharedValue<readonly TubeRect[]>(layout.tubes);
  const lift = useMemo<LiftState>(
    () => ({ upIndex, upProgress, downIndex, downProgress }),
    [upIndex, upProgress, downIndex, downProgress],
  );

  useEffect(() => {
    mirror.set(mirrorBoard(board));
    busy.set(false);
  }, [board, mirror, busy]);

  useEffect(() => {
    rects.set(layout.tubes);
  }, [layout, rects]);

  const handlePour = useCallback(
    (from: number, to: number) => {
      if (!onPour(from, to)) busy.set(false);
    },
    [onPour, busy],
  );

  const tapConfig = useMemo(() => {
    const animate = (target: number): number => {
      'worklet';
      return reducedMotion ? withTiming(target, REDUCED_LIFT) : withSpring(target, LIFT_SPRING);
    };
    const lower = (): void => {
      'worklet';
      if (upIndex.get() < 0) return;
      downIndex.set(upIndex.get());
      downProgress.set(upProgress.get());
      downProgress.set(animate(0));
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
      upProgress.set(animate(1));
    };
    return {
      onActivate: (event: { x: number; y: number }) => {
        'worklet';
        if (busy.get()) return;
        const tapped = hitTest(rects.get(), event.x, event.y);
        const outcome = resolveTap(mirror.get(), upIndex.get(), tapped);
        switch (outcome.kind) {
          case 'none':
            return;
          case 'select':
            raise(outcome.index);
            scheduleOnRN(onSelect, outcome.index);
            return;
          case 'deselect':
            lower();
            scheduleOnRN(onSelect, -1);
            return;
          case 'pour':
            lower();
            busy.set(true);
            scheduleOnRN(handlePour, outcome.from, outcome.to);
            return;
        }
      },
    };
  }, [
    reducedMotion,
    busy,
    rects,
    mirror,
    upIndex,
    upProgress,
    downIndex,
    downProgress,
    onSelect,
    handlePour,
  ]);
  const tap = useTapGesture(tapConfig);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <GestureDetector gesture={tap}>
        <Canvas style={styles.canvas}>
          <Picture picture={background} />
          {glow ? (
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
              />
            );
          })}
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
  const { upIndex, upProgress } = lift;
  const path = useDerivedValue(() => (upIndex.get() >= 0 ? outline : empty), [outline, empty]);
  const opacity = useDerivedValue(() => Math.min(1, Math.max(0, upProgress.get())));
  const transform = useDerivedValue<Transforms3d>(() => {
    const rect = rects.get()[upIndex.get()];
    if (rect === undefined) return [{ translateX: 0 }, { translateY: 0 }];
    return [
      { translateX: rect.drawn.x },
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
