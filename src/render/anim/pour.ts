/**
 * Pour animation model (spec §8.3). `planPour` runs once on the JS thread when a pour is committed
 * and returns plain numbers; `pourFrame` is a worklet that maps elapsed milliseconds to everything
 * the pour layer draws. One shared clock per pour drives the whole animation.
 *
 * Coordinates are canvas dp. The board is forced LTR, so the geometry never depends on the
 * locale's direction. The source tube rotates rigidly (liquid included) about its lip corner,
 * which is placed above the destination's mouth; the stream falls straight down from there.
 */
import type { Rect } from '../layout';
import {
  CAP_DROP_MS,
  CAP_SETTLE_MS,
  clamp01,
  easeInOutCubic,
  FLIP_MS,
  lerp,
  POUR_RETURN_MS,
  POUR_STREAM_END_LEAD_MS,
  POUR_STREAM_START_MS,
  POUR_TRAVEL_MS,
  pourDurationMs,
  progress,
  scaled,
  SPARKLE_MS,
  STREAM_HEAD_MS,
  STREAM_TAIL_MS,
} from './timing';

/** Tilt when the source is full; an emptied source ends at `MAX_TILT_DEG` (spec "up to ~75°"). */
export const MIN_TILT_DEG = 58;
export const MAX_TILT_DEG = 75;
/** Stream width (spec ≈ 6 dp). */
export const STREAM_WIDTH = 6;
/** Minimum arc height above the straight line from slot to pour position. */
export const MIN_ARC = 24;
/** Margin kept between the tilted body and the canvas edge when choosing the tilt side. */
const EDGE_MARGIN = 4;

export interface PourPlanInput {
  readonly from: number;
  readonly to: number;
  /** Segments moved. */
  readonly count: number;
  /** Palette id of the poured color. */
  readonly color: number;
  readonly sourceBefore: number;
  readonly targetBefore: number;
  readonly capacity: number;
  /** The pour exposed a hidden segment in the source. */
  readonly revealed: boolean;
  /** The destination is complete after the pour. */
  readonly completes: boolean;
  /** Resting drawn rects. */
  readonly source: Rect;
  readonly target: Rect;
  readonly segmentHeight: number;
  readonly wall: number;
  readonly canvasWidth: number;
  /** 1, or `REDUCED_MOTION_SCALE` with reduced motion. */
  readonly durationScale: number;
}

export interface PourTimes {
  readonly travelEnd: number;
  readonly streamStart: number;
  readonly streamEnd: number;
  /** End of the pour proper (`280 + 90 × count`); the return starts here. */
  readonly pourEnd: number;
  readonly returnEnd: number;
  readonly flipStart: number;
  readonly flipEnd: number;
  readonly capStart: number;
  readonly capImpact: number;
  readonly capEnd: number;
  readonly sparkleEnd: number;
  /** When the source tube is handed back to the static board. */
  readonly sourceRelease: number;
  /** When the destination tube is handed back to the static board. */
  readonly targetRelease: number;
  readonly total: number;
}

export interface PourPlan {
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly color: number;
  readonly sourceBefore: number;
  readonly sourceAfter: number;
  readonly targetBefore: number;
  readonly targetAfter: number;
  readonly capacity: number;
  readonly revealed: boolean;
  readonly completes: boolean;
  readonly tubeWidth: number;
  readonly tubeHeight: number;
  readonly segmentHeight: number;
  readonly wall: number;
  /** +1: the body swings to the right of the lip (counter-clockwise tilt); -1: to the left. */
  readonly side: 1 | -1;
  /** Local x of the lip corner the tube pivots on (0 or the tube width). */
  readonly lipX: number;
  /** Pivot at rest, unlifted. */
  readonly restX: number;
  readonly restY: number;
  /** Selection lift (dp) the source had when the pour started; set on the UI thread. */
  readonly startLift: number;
  /** Pivot while pouring. */
  readonly pourX: number;
  readonly pourY: number;
  readonly arc: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly times: PourTimes;
}

export interface PourFrame {
  /** Canvas position of the lip pivot. */
  readonly pivotX: number;
  readonly pivotY: number;
  /** Signed rotation in radians (negative = counter-clockwise). */
  readonly angle: number;
  /** Liquid levels in segments (fractional while pouring). */
  readonly sourceLevel: number;
  readonly targetLevel: number;
  /** Stream in canvas coordinates; hidden when `streamBottom <= streamTop`. */
  readonly streamX: number;
  readonly streamTop: number;
  readonly streamBottom: number;
  /** Reveal flip: horizontal scale (1 → 0 → 1) and which face shows. */
  readonly flipActive: boolean;
  readonly flipScale: number;
  readonly flipRevealed: boolean;
  /** Cap (destination-local offsets around the cap's bottom centre). */
  readonly capVisible: boolean;
  readonly capOffsetY: number;
  readonly capScaleX: number;
  readonly capScaleY: number;
  /** Sparkle progress 0..1, or -1 when not showing. */
  readonly sparkle: number;
}

const degToRad = (deg: number): number => {
  'worklet';
  return (deg * Math.PI) / 180;
};

/** Tilt (degrees) that brings a tube holding `level` of `capacity` segments to its lip. */
export const tiltForLevel = (level: number, capacity: number): number => {
  'worklet';
  const empty = capacity > 0 ? 1 - clamp01(level / capacity) : 1;
  return MIN_TILT_DEG + (MAX_TILT_DEG - MIN_TILT_DEG) * empty;
};

/** Horizontal reach of the tilted body beyond the pivot at `tiltDeg`. */
export const tiltedReach = (width: number, height: number, tiltDeg: number): number => {
  const angle = degToRad(tiltDeg);
  return height * Math.sin(angle) + width * Math.cos(angle);
};

/**
 * Which way the source swings: its body stays on the side it comes from (towards the canvas
 * centre when it is straight above or below), unless that would leave the canvas.
 */
export const chooseSide = (
  source: Rect,
  target: Rect,
  canvasWidth: number,
  reach: number,
): 1 | -1 => {
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  let side: 1 | -1;
  if (Math.abs(sourceCenter - targetCenter) > 0.5) side = sourceCenter > targetCenter ? 1 : -1;
  else side = targetCenter > canvasWidth / 2 ? -1 : 1;
  const fits = (s: 1 | -1): boolean =>
    s > 0 ? targetCenter + reach <= canvasWidth - EDGE_MARGIN : targetCenter - reach >= EDGE_MARGIN;
  if (!fits(side) && fits(side > 0 ? -1 : 1)) side = side > 0 ? -1 : 1;
  return side;
};

export const pourTimes = (
  count: number,
  revealed: boolean,
  completes: boolean,
  scale: number,
): PourTimes => {
  const pourEnd = scaled(pourDurationMs(count), scale);
  const travelEnd = scaled(POUR_TRAVEL_MS, scale);
  const streamStart = scaled(POUR_STREAM_START_MS, scale);
  const streamEnd = Math.max(streamStart + 1, pourEnd - scaled(POUR_STREAM_END_LEAD_MS, scale));
  const returnEnd = pourEnd + scaled(POUR_RETURN_MS, scale);
  const flipStart = revealed ? streamEnd : 0;
  const flipEnd = revealed ? flipStart + scaled(FLIP_MS, scale) : 0;
  const capStart = completes ? streamEnd : 0;
  const capImpact = completes ? capStart + scaled(CAP_DROP_MS, scale) : 0;
  const capEnd = completes ? capImpact + scaled(CAP_SETTLE_MS, scale) : 0;
  const sparkleEnd = completes ? capImpact + scaled(SPARKLE_MS, scale) : 0;
  const sourceRelease = Math.max(returnEnd, flipEnd);
  const targetRelease = completes ? Math.max(capEnd, sparkleEnd) : streamEnd;
  return {
    travelEnd,
    streamStart,
    streamEnd,
    pourEnd,
    returnEnd,
    flipStart,
    flipEnd,
    capStart,
    capImpact,
    capEnd,
    sparkleEnd,
    sourceRelease,
    targetRelease,
    total: Math.max(sourceRelease, targetRelease),
  };
};

export const planPour = (input: PourPlanInput): PourPlan => {
  const { source, target, segmentHeight, wall } = input;
  const width = source.width;
  const height = source.height;
  const sourceAfter = input.sourceBefore - input.count;
  const targetAfter = input.targetBefore + input.count;
  const reach = tiltedReach(width, height, tiltForLevel(sourceAfter, input.capacity));
  const side = chooseSide(source, target, input.canvasWidth, reach);
  const lipX = side > 0 ? 0 : width;
  const restX = source.x + lipX;
  const restY = source.y;
  const pourX = target.x + target.width / 2;
  const clearance = Math.max(segmentHeight * 0.9, width * 0.95) + 4;
  const pourY = target.y - clearance;
  const arc = Math.max(MIN_ARC, Math.abs(pourX - restX) * 0.3);
  return {
    from: input.from,
    to: input.to,
    count: input.count,
    color: input.color,
    sourceBefore: input.sourceBefore,
    sourceAfter,
    targetBefore: input.targetBefore,
    targetAfter,
    capacity: input.capacity,
    revealed: input.revealed,
    completes: input.completes,
    tubeWidth: width,
    tubeHeight: height,
    segmentHeight,
    wall,
    side,
    lipX,
    restX,
    restY,
    startLift: 0,
    pourX,
    pourY,
    arc,
    targetX: target.x,
    targetY: target.y,
    times: pourTimes(input.count, input.revealed, input.completes, input.durationScale),
  };
};

/** Local y of the liquid surface for `level` segments. */
export const levelTop = (plan: PourPlan, level: number): number => {
  'worklet';
  return plan.tubeHeight - plan.wall - level * plan.segmentHeight;
};

/** Cap squash-and-stretch after impact; `u` runs 0..1 over the settle. */
export const capSettle = (u: number): { offsetY: number; scaleX: number; scaleY: number } => {
  'worklet';
  const wave = Math.exp(-4 * u) * Math.cos(Math.PI * 3 * u) * (1 - u);
  return {
    offsetY: -6 * Math.max(0, -wave),
    scaleX: 1 + 0.22 * wave,
    scaleY: 1 - 0.32 * wave,
  };
};

/** Cap height dropped from, above its resting place. */
export const CAP_DROP_HEIGHT = 34;

export const pourFrame = (plan: PourPlan, ms: number): PourFrame => {
  'worklet';
  const t = plan.times;
  const tilt0 = tiltForLevel(plan.sourceBefore, plan.capacity);
  const startY = plan.restY - plan.startLift;
  const span = Math.max(1, t.streamEnd - t.streamStart);
  const headMs = Math.min(STREAM_HEAD_MS, span / 3);
  const tailMs = Math.min(STREAM_TAIL_MS, span / 3);

  let pivotX: number;
  let pivotY: number;
  let tiltDeg: number;
  let sourceLevel = plan.sourceBefore;
  if (ms < t.pourEnd) {
    const travel = easeInOutCubic(progress(ms, 0, t.travelEnd));
    pivotX = lerp(plan.restX, plan.pourX, travel);
    pivotY = lerp(startY, plan.pourY, travel) - plan.arc * Math.sin(Math.PI * travel);
    const drain = progress(ms, t.streamStart, t.streamEnd - tailMs);
    sourceLevel = lerp(plan.sourceBefore, plan.sourceAfter, drain);
    const tiltIn = easeInOutCubic(progress(ms, t.travelEnd * 0.4, t.streamStart));
    tiltDeg = ms < t.streamStart ? tilt0 * tiltIn : tiltForLevel(sourceLevel, plan.capacity);
  } else {
    const back = easeInOutCubic(progress(ms, t.pourEnd, t.returnEnd));
    pivotX = lerp(plan.pourX, plan.restX, back);
    pivotY = lerp(plan.pourY, plan.restY, back) - plan.arc * 0.5 * Math.sin(Math.PI * back);
    sourceLevel = plan.sourceAfter;
    const untilt = easeInOutCubic(Math.min(1, back * 1.4));
    tiltDeg = tiltForLevel(plan.sourceAfter, plan.capacity) * (1 - untilt);
  }

  const fill = progress(ms, t.streamStart + headMs, t.streamEnd);
  const targetLevel = lerp(plan.targetBefore, plan.targetAfter, fill);
  const surfaceY = plan.targetY + levelTop(plan, targetLevel);
  const lipY = plan.pourY + 1;
  let streamTop = lipY;
  let streamBottom = lipY;
  if (ms >= t.streamStart && ms < t.streamEnd) {
    const head = progress(ms, t.streamStart, t.streamStart + headMs);
    const tail = progress(ms, t.streamEnd - tailMs, t.streamEnd);
    streamBottom = lerp(lipY, surfaceY, head);
    streamTop = lerp(lipY, surfaceY, tail);
  }

  const flipActive = plan.revealed && ms >= t.flipStart;
  const flipT = flipActive ? progress(ms, t.flipStart, t.flipEnd) : 0;

  let capVisible = false;
  let capOffsetY = 0;
  let capScaleX = 1;
  let capScaleY = 1;
  let sparkle = -1;
  if (plan.completes && ms >= t.capStart) {
    capVisible = true;
    if (ms < t.capImpact) {
      const fall = progress(ms, t.capStart, t.capImpact);
      capOffsetY = -CAP_DROP_HEIGHT * (1 - fall * fall);
      capScaleX = 0.92;
      capScaleY = 1.1;
    } else {
      const settle = capSettle(progress(ms, t.capImpact, t.capEnd));
      capOffsetY = settle.offsetY;
      capScaleX = settle.scaleX;
      capScaleY = settle.scaleY;
      if (ms < t.sparkleEnd) sparkle = progress(ms, t.capImpact, t.sparkleEnd);
    }
  }

  return {
    pivotX,
    pivotY,
    angle: -plan.side * ((tiltDeg * Math.PI) / 180),
    sourceLevel,
    targetLevel,
    streamX: plan.pourX,
    streamTop,
    streamBottom,
    flipActive,
    flipScale: Math.abs(Math.cos(Math.PI * flipT)),
    flipRevealed: flipT >= 0.5,
    capVisible,
    capOffsetY,
    capScaleX,
    capScaleY,
    sparkle,
  };
};
