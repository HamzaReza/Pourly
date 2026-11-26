import {
  Atlas,
  BlurMask,
  Group,
  Path,
  useRSXformBuffer,
  type SkImage,
  type SkPath,
  type SkRect,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Move } from '@/game/types';

import {
  bubbleState,
  confettiState,
  createBubbles,
  hideSprite,
  hintAlpha,
  MAX_BUBBLES,
  MAX_CONFETTI,
  placeSprite,
  winGlowAlpha,
  type ConfettiParticle,
  type WinTimeline,
} from './anim/effects';
import { HINT_PULSE_MS, scaled } from './anim/timing';
import type { TubeRect } from './layout';
import { GLOW_BLUR, GLOW_STROKE } from './scene';
import { BUBBLE_SIZE, CONFETTI_SIZE, SPRITE_SCALE } from './sprites';
import { tubeOffset, type LiftState } from './TubeLayer';

interface GlowRingProps {
  outline: SkPath;
  empty: SkPath;
  color: string;
  blur: boolean;
  transform: SharedValue<Transforms3d>;
  opacity: SharedValue<number>;
}

/** A glow ring that draws an empty path (no blur work) while it is invisible. */
const GlowRing = ({ outline, empty, color, blur, transform, opacity }: GlowRingProps) => {
  const path = useDerivedValue(() => (opacity.get() > 0.001 ? outline : empty));
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={GLOW_STROKE} color={color}>
        {blur ? <BlurMask blur={GLOW_BLUR} style="normal" /> : null}
      </Path>
    </Group>
  );
};

interface WinGlowProps {
  index: number;
  rect: TubeRect;
  outline: SkPath;
  empty: SkPath;
  color: string;
  blur: boolean;
  clock: SharedValue<number>;
  timeline: WinTimeline;
}

const WinGlowComponent = ({
  index,
  rect,
  outline,
  empty,
  color,
  blur,
  clock,
  timeline,
}: WinGlowProps) => {
  const x = rect.drawn.x;
  const y = rect.drawn.y;
  const transform = useDerivedValue<Transforms3d>(() => [{ translateX: x }, { translateY: y }]);
  const opacity = useDerivedValue(() => {
    const ms = clock.get();
    return ms < 0 ? 0 : winGlowAlpha(timeline, index, ms);
  });
  return (
    <GlowRing
      outline={outline}
      empty={empty}
      color={color}
      blur={blur}
      transform={transform}
      opacity={opacity}
    />
  );
};

const WinGlow = memo(WinGlowComponent);

export interface WinGlowLayerProps {
  rects: readonly TubeRect[];
  outline: SkPath;
  empty: SkPath;
  color: string;
  blur: boolean;
  /** Milliseconds into the win sequence, or -1 before it starts. */
  clock: SharedValue<number>;
  timeline: WinTimeline;
}

/** Staggered glow across every tube, left to right, row by row. Drawn behind the tubes. */
const WinGlowLayerComponent = ({
  rects,
  outline,
  empty,
  color,
  blur,
  clock,
  timeline,
}: WinGlowLayerProps) => (
  <Group>
    {rects.map((rect, index) => (
      <WinGlow
        key={index}
        index={index}
        rect={rect}
        outline={outline}
        empty={empty}
        color={color}
        blur={blur}
        clock={clock}
        timeline={timeline}
      />
    ))}
  </Group>
);

export const WinGlowLayer = memo(WinGlowLayerComponent);

export interface ConfettiLayerProps {
  particles: readonly ConfettiParticle[];
  clock: SharedValue<number>;
  timeline: WinTimeline;
  width: number;
  height: number;
  texture: SharedValue<SkImage | null>;
  sprites: readonly SkRect[];
}

/** Up to 60 confetti pieces from one atlas draw; transforms are updated in place. */
const ConfettiLayerComponent = ({
  particles,
  clock,
  timeline,
  width,
  height,
  texture,
  sprites,
}: ConfettiLayerProps) => {
  const spriteRects = useMemo(
    () =>
      Array.from({ length: MAX_CONFETTI }, (_, index) => {
        const color = particles[index]?.color ?? 0;
        const sprite = sprites[color] ?? sprites[0];
        if (sprite === undefined) throw new Error('Sprite sheet has no confetti');
        return sprite;
      }),
    [particles, sprites],
  );
  const spriteWidth = CONFETTI_SIZE.width * SPRITE_SCALE;
  const spriteHeight = CONFETTI_SIZE.height * SPRITE_SCALE;
  const transforms = useRSXformBuffer(MAX_CONFETTI, (target, index) => {
    'worklet';
    const ms = clock.get();
    const particle = particles[index];
    const start = timeline.confettiStart;
    if (particle === undefined || start < 0 || ms < start) {
      hideSprite(target);
      return;
    }
    if (ms > timeline.confettiEnd) {
      hideSprite(target);
      return;
    }
    const state = confettiState(particle, ms - start, width);
    if (state === null || state.y > height + 40) {
      hideSprite(target);
      return;
    }
    placeSprite(
      target,
      particle.scale / SPRITE_SCALE,
      state.angle,
      state.x,
      state.y,
      spriteWidth,
      spriteHeight,
    );
  });
  return <Atlas image={texture} sprites={spriteRects} transforms={transforms} />;
};

export const ConfettiLayer = memo(ConfettiLayerComponent);

export interface BubbleLayerProps {
  width: number;
  height: number;
  texture: SharedValue<SkImage | null>;
  sprite: SkRect;
}

/**
 * Up to 12 slow background bubbles (spec §8.3). Mounted only in high quality without reduced
 * motion; a frame callback advances one clock and one atlas draws them all.
 */
const BubbleLayerComponent = ({ width, height, texture, sprite }: BubbleLayerProps) => {
  const bubbles = useMemo(() => createBubbles(MAX_BUBBLES), []);
  const sprites = useMemo(() => Array.from({ length: MAX_BUBBLES }, () => sprite), [sprite]);
  const spriteSize = BUBBLE_SIZE * SPRITE_SCALE;
  const seconds = useSharedValue(0);
  useFrameCallback((frame) => {
    'worklet';
    seconds.set(frame.timeSinceFirstFrame / 1000);
  });
  const transforms = useRSXformBuffer(MAX_BUBBLES, (target, index) => {
    'worklet';
    const bubble = bubbles[index];
    if (bubble === undefined) {
      hideSprite(target);
      return;
    }
    const size = BUBBLE_SIZE * bubble.size;
    const state = bubbleState(bubble, seconds.get(), width, height, size);
    placeSprite(target, bubble.size / SPRITE_SCALE, 0, state.x, state.y, spriteSize, spriteSize);
  });
  return <Atlas image={texture} sprites={sprites} transforms={transforms} />;
};

export const BubbleLayer = memo(BubbleLayerComponent);

export interface HintGlowProps {
  hint: Move;
  rects: readonly TubeRect[];
  outline: SkPath;
  empty: SkPath;
  color: string;
  blur: boolean;
  lift: LiftState;
  durationScale: number;
}

interface HintRingProps {
  index: number;
  rect: TubeRect;
  outline: SkPath;
  empty: SkPath;
  color: string;
  blur: boolean;
  lift: LiftState;
  opacity: SharedValue<number>;
}

const HintRing = ({ index, rect, outline, empty, color, blur, lift, opacity }: HintRingProps) => {
  const x = rect.drawn.x;
  const y = rect.drawn.y;
  const transform = useDerivedValue<Transforms3d>(() => {
    const offset = tubeOffset(lift, index);
    return [{ translateX: x + offset.x }, { translateY: y + offset.y }];
  });
  return (
    <GlowRing
      outline={outline}
      empty={empty}
      color={color}
      blur={blur}
      transform={transform}
      opacity={opacity}
    />
  );
};

/** Pulsing glow on a hint's source and destination tubes (driven by the `hint` board prop). */
const HintGlowComponent = ({
  hint,
  rects,
  outline,
  empty,
  color,
  blur,
  lift,
  durationScale,
}: HintGlowProps) => {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(0);
    pulse.set(
      withRepeat(
        withTiming(1, {
          duration: scaled(HINT_PULSE_MS, durationScale),
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [pulse, durationScale, hint]);
  const opacity = useDerivedValue(() => hintAlpha(pulse.get()));
  const source = rects[hint.from];
  const target = rects[hint.to];
  return (
    <Group>
      {source !== undefined ? (
        <HintRing
          index={hint.from}
          rect={source}
          outline={outline}
          empty={empty}
          color={color}
          blur={blur}
          lift={lift}
          opacity={opacity}
        />
      ) : null}
      {target !== undefined ? (
        <HintRing
          index={hint.to}
          rect={target}
          outline={outline}
          empty={empty}
          color={color}
          blur={blur}
          lift={lift}
          opacity={opacity}
        />
      ) : null}
    </Group>
  );
};

export const HintGlow = memo(HintGlowComponent);
