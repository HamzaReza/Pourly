import {
  chooseSide,
  EDGE_MARGIN,
  MAX_TILT_DEG,
  maxTiltForRoom,
  MIN_TILT_DEG,
  planPour,
  tiltedReach,
  tiltForLevel,
  tubeExtent,
  type PourPlanInput,
} from '@/render/anim/pour';
import type { Rect } from '@/render/layout';

const tube = (x: number, y = 300): Rect => ({ x, y, width: 40, height: 160 });
const extent = tubeExtent(40, 160, 2.8);

const input = (source: Rect, target: Rect, canvasWidth = 1000): PourPlanInput => ({
  from: 0,
  to: 1,
  count: 2,
  color: 3,
  sourceBefore: 4,
  targetBefore: 1,
  capacity: 4,
  revealed: false,
  completes: false,
  source,
  target,
  segmentHeight: 34,
  wall: 2.8,
  canvasWidth,
  durationScale: 1,
});

describe('tilt', () => {
  it('runs from 58° for a full source to 75° for an emptied one, decreasing with the level', () => {
    expect(tiltForLevel(4, 4)).toBe(MIN_TILT_DEG);
    expect(tiltForLevel(0, 4)).toBe(MAX_TILT_DEG);
    expect(tiltForLevel(2, 4)).toBeCloseTo(66.5);
    for (let level = 1; level <= 4; level += 1) {
      expect(tiltForLevel(level, 4)).toBeLessThan(tiltForLevel(level - 1, 4));
    }
  });

  it('sweeps further the more segments are poured', () => {
    const sweep = (count: number) => tiltForLevel(4 - count, 4) - tiltForLevel(4, 4);
    expect(sweep(2)).toBeCloseTo(sweep(1) * 2);
    expect(sweep(4)).toBeCloseTo(sweep(1) * 4);
  });
});

describe('tube extent and tilt cap', () => {
  it('measures the outline with the lip: upright reach is the width plus the lip overhang', () => {
    expect(tiltedReach(extent, 0)).toBeCloseTo(40 + extent.overhang);
    expect(extent.diagonal).toBeGreaterThan(160);
    expect(tiltedReach(extent, 60)).toBeGreaterThan(tiltedReach(extent, 30));
  });

  it('caps the tilt to the available room', () => {
    expect(maxTiltForRoom(extent, 10_000)).toBe(MAX_TILT_DEG);
    expect(maxTiltForRoom(extent, 20)).toBe(0);
    const room = tiltedReach(extent, 40);
    expect(maxTiltForRoom(extent, room)).toBeCloseTo(40, 5);
  });
});

describe('chooseSide', () => {
  it('swings the body to the side the source comes from', () => {
    expect(chooseSide(tube(700), tube(400), 1000, extent, 75)).toBe(1);
    expect(chooseSide(tube(100), tube(400), 1000, extent, 75)).toBe(-1);
  });

  it('swings towards the canvas centre when the source is straight above or below', () => {
    expect(chooseSide(tube(200, 600), tube(200), 1000, extent, 75)).toBe(1);
    expect(chooseSide(tube(760, 600), tube(760), 1000, extent, 75)).toBe(-1);
  });

  it('uses the other side when the preferred one would leave the canvas', () => {
    expect(chooseSide(tube(900), tube(820), 1000, extent, 75)).toBe(-1);
    expect(chooseSide(tube(10), tube(60), 1000, extent, 75)).toBe(1);
  });

  it('takes the side with more room when neither fits', () => {
    expect(chooseSide(tube(260), tube(130), 360, extent, 75)).toBe(1);
    expect(chooseSide(tube(40), tube(190), 360, extent, 75)).toBe(-1);
  });
});

describe('planPour', () => {
  it('pivots on the lip corner of the swing side and pours above the target centre', () => {
    const right = planPour(input(tube(700), tube(400)));
    expect(right.side).toBe(1);
    expect(right.lipX).toBe(0);
    expect(right.restX).toBe(700);
    expect(right.pourX).toBe(420);
    expect(right.pourY).toBeLessThan(300);

    const left = planPour(input(tube(100), tube(400)));
    expect(left.side).toBe(-1);
    expect(left.lipX).toBe(40);
    expect(left.restX).toBe(140);
  });

  it('records levels, limits and timings', () => {
    const plan = planPour(input(tube(700), tube(400)));
    expect(plan.sourceAfter).toBe(2);
    expect(plan.targetAfter).toBe(3);
    expect(plan.minX).toBe(EDGE_MARGIN);
    expect(plan.maxX).toBe(1000 - EDGE_MARGIN);
    expect(plan.startLift).toBe(0);
    expect(plan.times.pourEnd).toBe(950);
  });

  it('lowers the pour position so the raised end stays below the top edge', () => {
    const plan = planPour(input(tube(700, 30), tube(400, 20)));
    expect(plan.pourY).toBeGreaterThanOrEqual(EDGE_MARGIN);
  });
});
