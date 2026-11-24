import {
  Atlas,
  Group,
  Oval,
  Picture,
  RoundedRect,
  useRSXformBuffer,
  type SkImage,
  type SkPicture,
  type SkRect,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { hideSprite, MAX_SPARKLES, placeSprite, sparkleState } from './anim/effects';
import { levelTop, pourFrame, STREAM_WIDTH, type PourPlan } from './anim/pour';
import { LIQUID_COLORS } from './palette';
import type { PourPictureSet } from './pourPictures';
import { SURFACE_ALPHA, type GlassPictures, type TubePaths } from './scene';
import { SPARKLE_SIZE, SPRITE_SCALE } from './sprites';

/** One pour in flight: plan and pictures are null while the slot is idle. */
export interface PourSlotState {
  readonly plan: SharedValue<PourPlan | null>;
  readonly pictures: SharedValue<PourPictureSet | null>;
  /** Milliseconds since the pour started. */
  readonly clock: SharedValue<number>;
}

const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0 } as const;
const ORIGIN: Transforms3d = [{ translateX: 0 }, { translateY: 0 }];
const SURFACE_COLOR = `rgba(255,255,255,${SURFACE_ALPHA})`;

export interface PourSlotProps {
  slot: PourSlotState;
  paths: TubePaths;
  glass: GlassPictures;
  empty: SkPicture;
  texture: SharedValue<SkImage | null>;
  sparkleSprite: SkRect;
  /** Sparkles for a completed tube (halved in low quality). */
  sparkles: number;
}

/**
 * Draws the two tubes of one pour from its shared clock: the destination filling in place (with
 * the stream, cap drop and sparkles), then the source flying, tilting, draining and flipping its
 * revealed segment. Everything is derived on the UI thread from `pourFrame`; React never
 * re-renders during the pour.
 */
const PourSlotComponent = ({
  slot,
  paths,
  glass,
  empty,
  texture,
  sparkleSprite,
  sparkles,
}: PourSlotProps) => {
  const { plan, pictures, clock } = slot;
  const surface = useMemo(
    () => ({
      x: paths.surface.x,
      y: paths.surface.y,
      width: paths.surface.width,
      height: paths.surface.height,
    }),
    [paths],
  );

  const frame = useDerivedValue(() => {
    const current = plan.get();
    return current === null ? null : pourFrame(current, clock.get());
  });

  const active = useDerivedValue(() => plan.get() !== null);
  const glassBack = useDerivedValue(() => (active.get() ? glass.back : empty), [glass, empty]);
  const glassFront = useDerivedValue(() => (active.get() ? glass.front : empty), [glass, empty]);

  const targetTransform = useDerivedValue<Transforms3d>(() => {
    const current = plan.get();
    if (current === null) return ORIGIN;
    return [{ translateX: current.targetX }, { translateY: current.targetY }];
  });
  const targetLiquid = useDerivedValue(() => pictures.get()?.target ?? empty, [empty]);
  const targetClip = useDerivedValue(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null) return ZERO_RECT;
    const top = levelTop(current, f.targetLevel);
    return {
      x: -current.tubeWidth,
      y: top,
      width: current.tubeWidth * 3,
      height: current.tubeHeight,
    };
  });
  const targetSurface = useDerivedValue(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null || f.targetLevel <= 0) return ZERO_RECT;
    const top = levelTop(current, f.targetLevel);
    return { x: surface.x, y: top + surface.y, width: surface.width, height: surface.height };
  }, [surface]);

  const stream = useDerivedValue(() => {
    const f = frame.get();
    if (f === null || f.streamBottom <= f.streamTop) return { rect: ZERO_RECT, rx: 0, ry: 0 };
    const radius = STREAM_WIDTH / 2;
    return {
      rect: {
        x: f.streamX - radius,
        y: f.streamTop,
        width: STREAM_WIDTH,
        height: f.streamBottom - f.streamTop,
      },
      rx: radius,
      ry: radius,
    };
  });
  const streamColor = useDerivedValue(() => {
    const current = plan.get();
    return current === null ? 'transparent' : (LIQUID_COLORS[current.color]?.base ?? 'transparent');
  });

  const capPicture = useDerivedValue(() => {
    const f = frame.get();
    return f !== null && f.capVisible ? (pictures.get()?.cap ?? empty) : empty;
  }, [empty]);
  const capTransform = useDerivedValue<Transforms3d>(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null) return ORIGIN;
    const cx = current.tubeWidth / 2;
    return [
      { translateX: cx },
      { translateY: f.capOffsetY },
      { scaleX: f.capScaleX },
      { scaleY: f.capScaleY },
      { translateX: -cx },
    ];
  });

  const sparkleSprites = useMemo(
    () => Array.from({ length: MAX_SPARKLES }, () => sparkleSprite),
    [sparkleSprite],
  );
  const sparkleTransforms = useRSXformBuffer(MAX_SPARKLES, (target, index) => {
    'worklet';
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null || f.sparkle < 0 || index >= sparkles) {
      hideSprite(target);
      return;
    }
    const state = sparkleState(index, sparkles, f.sparkle);
    const size = SPARKLE_SIZE * SPRITE_SCALE;
    placeSprite(
      target,
      state.size / SPRITE_SCALE,
      state.angle,
      current.targetX + current.tubeWidth / 2 + state.dx,
      current.targetY - 2 + state.dy,
      size,
      size,
    );
  });

  const sourceTransform = useDerivedValue<Transforms3d>(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null) return ORIGIN;
    return [
      { translateX: f.pivotX },
      { translateY: f.pivotY },
      { rotate: f.angle },
      { translateX: -current.lipX },
    ];
  });
  const sourceLiquid = useDerivedValue(() => pictures.get()?.source ?? empty, [empty]);
  const sourceClip = useDerivedValue(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null) return ZERO_RECT;
    const level = f.flipActive ? current.sourceAfter - 1 : f.sourceLevel;
    const top = levelTop(current, level);
    return {
      x: -current.tubeWidth,
      y: top,
      width: current.tubeWidth * 3,
      height: current.tubeHeight,
    };
  });
  const sourceSurface = useDerivedValue(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null || f.sourceLevel <= 0) return ZERO_RECT;
    if (f.flipActive && clock.get() < current.times.flipEnd) return ZERO_RECT;
    const top = levelTop(current, f.sourceLevel);
    return { x: surface.x, y: top + surface.y, width: surface.width, height: surface.height };
  }, [surface]);
  const flipPicture = useDerivedValue(() => {
    const f = frame.get();
    const current = pictures.get();
    if (f === null || current === null || !f.flipActive) return empty;
    return f.flipRevealed ? current.flipShown : current.flipHidden;
  }, [empty]);
  const flipTransform = useDerivedValue<Transforms3d>(() => {
    const current = plan.get();
    const f = frame.get();
    if (current === null || f === null) return ORIGIN;
    const cx = current.tubeWidth / 2;
    const cy = levelTop(current, current.sourceAfter - 0.5);
    return [
      { translateX: cx },
      { translateY: cy },
      { scaleX: Math.max(0.001, f.flipScale) },
      { translateX: -cx },
      { translateY: -cy },
    ];
  });

  return (
    <Group>
      <Group transform={targetTransform}>
        <Picture picture={glassBack} />
        <Group clip={targetClip}>
          <Picture picture={targetLiquid} />
        </Group>
        <Oval rect={targetSurface} color={SURFACE_COLOR} />
      </Group>
      <RoundedRect rect={stream} color={streamColor} />
      <Group transform={targetTransform}>
        <Picture picture={glassFront} />
        <Group transform={capTransform}>
          <Picture picture={capPicture} />
        </Group>
      </Group>
      <Atlas image={texture} sprites={sparkleSprites} transforms={sparkleTransforms} />
      <Group transform={sourceTransform}>
        <Picture picture={glassBack} />
        <Group clip={sourceClip}>
          <Picture picture={sourceLiquid} />
        </Group>
        <Group transform={flipTransform}>
          <Picture picture={flipPicture} />
        </Group>
        <Oval rect={sourceSurface} color={SURFACE_COLOR} />
        <Picture picture={glassFront} />
      </Group>
    </Group>
  );
};

export const PourSlot = memo(PourSlotComponent);
