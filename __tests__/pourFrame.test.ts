import {
  capSettle,
  CAP_DROP_HEIGHT,
  levelTop,
  planPour,
  pourFrame,
  tubeCorners,
  type PourPlan,
  type PourPlanInput,
} from '@/render/anim/pour';
import { computeBoardLayout, SELECTION_LIFT } from '@/render/layout';

const layoutFor = (width: number, height: number, tubeCount: number) =>
  computeBoardLayout({
    area: { x: 8, y: 80, width: width - 16, height: height - 80 - 92 },
    tubeCount,
    capacity: 4,
  });

const planFor = (
  from: number,
  to: number,
  options: Partial<PourPlanInput> = {},
  canvas: readonly [number, number] = [412, 915],
  tubeCount = 8,
): PourPlan => {
  const layout = layoutFor(canvas[0], canvas[1], tubeCount);
  const source = layout.tubes[from];
  const target = layout.tubes[to];
  if (source === undefined || target === undefined) throw new Error('bad tube');
  const plan = planPour({
    from,
    to,
    count: 2,
    color: 1,
    sourceBefore: 4,
    targetBefore: 1,
    capacity: 4,
    revealed: false,
    completes: false,
    source: source.drawn,
    target: target.drawn,
    segmentHeight: layout.segmentHeight,
    wall: layout.wall,
    canvasWidth: canvas[0],
    durationScale: 1,
    ...options,
  });
  return { ...plan, startLift: SELECTION_LIFT };
};

describe('pourFrame', () => {
  it('starts from the lifted resting slot, upright, with nothing poured', () => {
    const plan = planFor(2, 1);
    const f = pourFrame(plan, 0);
    expect(f.pivotX).toBeCloseTo(plan.restX);
    expect(f.pivotY).toBeCloseTo(plan.restY - SELECTION_LIFT);
    expect(f.angle).toBeCloseTo(0);
    expect(f.sourceLevel).toBe(4);
    expect(f.targetLevel).toBe(1);
    expect(f.streamBottom).toBeLessThanOrEqual(f.streamTop);
  });

  it('ends the pour with the final levels and returns upright to the unlifted slot', () => {
    const plan = planFor(2, 1);
    const end = pourFrame(plan, plan.times.pourEnd);
    expect(end.sourceLevel).toBe(2);
    expect(end.targetLevel).toBe(3);
    expect(end.streamBottom).toBeLessThanOrEqual(end.streamTop);
    const back = pourFrame(plan, plan.times.returnEnd);
    expect(back.pivotX).toBeCloseTo(plan.restX);
    expect(back.pivotY).toBeCloseTo(plan.restY);
    expect(back.angle).toBeCloseTo(0);
  });

  it('shows the stream only while pouring, from the lip down to the target surface', () => {
    const plan = planFor(2, 1);
    const t = plan.times;
    expect(pourFrame(plan, t.streamStart - 1).streamBottom).toBeLessThanOrEqual(
      pourFrame(plan, t.streamStart - 1).streamTop,
    );
    const mid = pourFrame(plan, (t.streamStart + t.streamEnd) / 2);
    expect(mid.streamBottom).toBeGreaterThan(mid.streamTop);
    expect(mid.streamX).toBe(plan.pourX);
    expect(mid.streamBottom).toBeCloseTo(plan.targetY + levelTop(plan, mid.targetLevel));
  });

  it('moves the levels monotonically and tilts towards the swing side', () => {
    const plan = planFor(2, 1);
    let source = Infinity;
    let target = -Infinity;
    for (let ms = 0; ms <= plan.times.total; ms += 10) {
      const f = pourFrame(plan, ms);
      expect(f.sourceLevel).toBeLessThanOrEqual(source);
      expect(f.targetLevel).toBeGreaterThanOrEqual(target);
      expect(Math.sign(f.angle) * plan.side).toBeLessThanOrEqual(0);
      source = f.sourceLevel;
      target = f.targetLevel;
    }
  });

  it('flips a revealed segment 1 → 0 → 1 and swaps faces at the midpoint', () => {
    const plan = planFor(2, 1, { revealed: true });
    const { flipStart, flipEnd } = plan.times;
    const at = (share: number) => pourFrame(plan, flipStart + (flipEnd - flipStart) * share);
    expect(pourFrame(plan, flipStart - 1).flipActive).toBe(false);
    expect(at(0).flipScale).toBeCloseTo(1);
    expect(at(0.45).flipRevealed).toBe(false);
    expect(at(0.5).flipScale).toBeCloseTo(0);
    expect(at(0.55).flipRevealed).toBe(true);
    expect(at(1).flipScale).toBeCloseTo(1);
  });

  it('drops the cap from above, squashes on impact and shows sparkles until they end', () => {
    const plan = planFor(2, 1, { completes: true, targetBefore: 2 });
    const t = plan.times;
    expect(pourFrame(plan, t.capStart - 1).capVisible).toBe(false);
    const start = pourFrame(plan, t.capStart);
    expect(start.capVisible).toBe(true);
    expect(start.capOffsetY).toBeCloseTo(-CAP_DROP_HEIGHT);
    expect(pourFrame(plan, t.capImpact - 1).sparkle).toBe(-1);
    const sparkling = pourFrame(plan, (t.capImpact + t.sparkleEnd) / 2).sparkle;
    expect(sparkling).toBeGreaterThan(0);
    expect(sparkling).toBeLessThan(1);
    expect(pourFrame(plan, t.sparkleEnd).sparkle).toBe(-1);
  });

  it('settles the cap with a squash that ends at rest', () => {
    const impact = capSettle(0);
    expect(impact.scaleY).toBeLessThan(1);
    expect(impact.scaleX).toBeGreaterThan(1);
    const rest = capSettle(1);
    expect(rest.scaleX).toBeCloseTo(1);
    expect(rest.scaleY).toBeCloseTo(1);
    expect(rest.offsetY).toBeCloseTo(0);
  });
});

describe('pouring tube stays inside the canvas (regression)', () => {
  const canvases: readonly (readonly [number, number])[] = [
    [320, 480],
    [412, 915],
    [1024, 1366],
  ];
  it.each(canvases)('keeps every rotated corner on a %ix%i canvas', (width, height) => {
    let checked = 0;
    for (const tubeCount of [8, 16]) {
      for (let from = 0; from < tubeCount; from += 1) {
        for (let to = 0; to < tubeCount; to += 1) {
          if (from === to) continue;
          for (const [sourceBefore, count] of [
            [4, 4],
            [4, 1],
          ] as const) {
            const plan = planFor(
              from,
              to,
              { sourceBefore, count, targetBefore: 0 },
              [width, height],
              tubeCount,
            );
            for (let ms = 0; ms <= plan.times.returnEnd; ms += 20) {
              for (const corner of tubeCorners(plan, pourFrame(plan, ms))) {
                checked += 1;
                if (
                  corner.x < -0.01 ||
                  corner.x > width + 0.01 ||
                  corner.y < -0.01 ||
                  corner.y > height + 0.01
                ) {
                  throw new Error(
                    `${tubeCount} tubes ${from}→${to} at ${ms} ms: corner (${corner.x}, ${corner.y})`,
                  );
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
