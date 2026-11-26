import {
  computeBoardLayout,
  HIT_SLOP_Y,
  hitTest,
  MAX_TUBE_ASPECT,
  MAX_TUBE_WIDTH,
  MIN_HIT_WIDTH,
  MIN_TUBE_ASPECT,
  rowsFor,
  SELECTION_LIFT,
  type Rect,
} from '@/render/layout';

const EPS = 1e-6;

/** Board area as the game screen computes it: status bar, 56 dp top bar, 76 dp bottom bar. */
const areaFor = (width: number, height: number): Rect => ({
  x: 8,
  y: 24 + 56,
  width: width - 16,
  height: height - 24 - 56 - 76 - 16,
});

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 480],
  [360, 640],
  [360, 800],
  [393, 852],
  [412, 915],
  [344, 882],
  [673, 841],
  [884, 1104],
  [800, 1280],
  [1024, 1366],
];

const CASES = SCREENS.flatMap(([width, height]) =>
  Array.from({ length: 14 }, (_, i) => ({ width, height, tubeCount: i + 3 })),
);

const layoutFor = (width: number, height: number, tubeCount: number) => {
  const area = areaFor(width, height);
  return { area, layout: computeBoardLayout({ area, tubeCount, capacity: 4 }) };
};

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS &&
  inner.y >= outer.y - EPS &&
  inner.x + inner.width <= outer.x + outer.width + EPS &&
  inner.y + inner.height <= outer.y + outer.height + EPS;

const lifted = (rect: Rect): Rect => ({
  ...rect,
  y: rect.y - SELECTION_LIFT,
  height: rect.height + SELECTION_LIFT,
});

describe('layout', () => {
  it('picks rows by tube count', () => {
    expect(rowsFor(5)).toBe(1);
    expect(rowsFor(6)).toBe(2);
    expect(rowsFor(12)).toBe(2);
    expect(rowsFor(13)).toBe(3);
  });

  it('keeps every tube inside the area, including its selection lift', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { area, layout } = layoutFor(width, height, tubeCount);
      expect(layout.tubes).toHaveLength(tubeCount);
      for (const tube of layout.tubes) expect(inside(lifted(tube.drawn), area)).toBe(true);
    }
  });

  it('gives every tube a hit rect at least 44 dp wide inside the area', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { area, layout } = layoutFor(width, height, tubeCount);
      for (const tube of layout.tubes) {
        expect(tube.hit.width).toBeGreaterThanOrEqual(MIN_HIT_WIDTH - EPS);
        expect(inside(tube.hit, area)).toBe(true);
      }
    }
  });

  it('never overlaps hit rects', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { tubes } = layoutFor(width, height, tubeCount).layout;
      tubes.forEach((first, i) => {
        tubes.slice(i + 1).forEach((second) => {
          const a = first.hit;
          const b = second.hit;
          const overlaps =
            a.x < b.x + b.width - EPS &&
            b.x < a.x + a.width - EPS &&
            a.y < b.y + b.height - EPS &&
            b.y < a.y + a.height - EPS;
          expect(overlaps).toBe(false);
        });
      });
    }
  });

  it('inverts placement with hitTest', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { tubes } = layoutFor(width, height, tubeCount).layout;
      tubes.forEach(({ hit, drawn }, index) => {
        expect(hitTest(tubes, hit.x + hit.width / 2, hit.y + hit.height / 2)).toBe(index);
        expect(hitTest(tubes, drawn.x + drawn.width / 2, drawn.y + drawn.height / 2)).toBe(index);
      });
    }
  });

  it('returns -1 outside every rect and treats far edges as half-open', () => {
    const { area, layout } = layoutFor(412, 915, 5);
    const { tubes } = layout;
    expect(hitTest(tubes, area.x - 1, area.y + 10)).toBe(-1);
    expect(hitTest(tubes, area.x + area.width + 1, area.y + 10)).toBe(-1);
    expect(hitTest(tubes, area.x + area.width / 2, area.y - 1)).toBe(-1);
    const first = tubes[0];
    const second = tubes[1];
    if (first === undefined || second === undefined) throw new Error('missing tubes');
    const edgeX = first.hit.x + first.hit.width;
    expect(edgeX).toBeCloseTo(second.hit.x, 6);
    expect(hitTest(tubes, second.hit.x, second.hit.y + 1)).toBe(1);
    expect(hitTest(tubes, edgeX - 0.001, first.hit.y + 1)).toBe(0);
    expect(hitTest([], 10, 10)).toBe(-1);
  });

  it('centers a short last row', () => {
    for (const tubeCount of [7, 13]) {
      const { area, layout } = layoutFor(412, 915, tubeCount);
      const lastRow = layout.tubes.filter((tube) => tube.row === layout.rows - 1);
      expect(lastRow.length).toBeLessThan(layout.cols);
      const left = Math.min(...lastRow.map((tube) => tube.hit.x));
      const right = Math.max(...lastRow.map((tube) => tube.hit.x + tube.hit.width));
      expect((left + right) / 2).toBeCloseTo(area.x + area.width / 2, 6);
    }
  });

  it('clamps the tube aspect and width', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { layout } = layoutFor(width, height, tubeCount);
      const aspect = layout.tubeHeight / layout.tubeWidth;
      expect(layout.tubeWidth).toBeLessThanOrEqual(MAX_TUBE_WIDTH + EPS);
      expect(aspect).toBeGreaterThanOrEqual(MIN_TUBE_ASPECT - EPS);
      expect(aspect).toBeLessThanOrEqual(MAX_TUBE_ASPECT + EPS);
    }
  });

  it('places each drawn tube inside its hit rect', () => {
    for (const { width, height, tubeCount } of CASES) {
      for (const tube of layoutFor(width, height, tubeCount).layout.tubes) {
        expect(inside(lifted(tube.drawn), tube.hit)).toBe(true);
      }
    }
  });

  it('ignores taps in the empty board space above and below the tubes', () => {
    for (const { width, height, tubeCount } of CASES) {
      const { area, layout } = layoutFor(width, height, tubeCount);
      for (const tube of layout.tubes) {
        const { drawn, hit } = tube;
        const centerX = drawn.x + drawn.width / 2;
        // The hit rect hugs the tube: lift headroom above, shadow below, plus a small slop.
        expect(drawn.y - hit.y).toBeLessThanOrEqual(SELECTION_LIFT + 10 + HIT_SLOP_Y + EPS);
        expect(hit.y + hit.height - (drawn.y + drawn.height)).toBeLessThanOrEqual(
          8 + HIT_SLOP_Y + EPS,
        );
        // Just above the lifted lip still selects the tube.
        expect(hitTest(layout.tubes, centerX, drawn.y - SELECTION_LIFT - 4)).not.toBe(-1);
      }
      const top = Math.min(...layout.tubes.map((tube) => tube.hit.y));
      const bottom = Math.max(...layout.tubes.map((tube) => tube.hit.y + tube.hit.height));
      const midX = area.x + area.width / 2;
      if (top - area.y > 2) expect(hitTest(layout.tubes, midX, area.y + 1)).toBe(-1);
      if (area.y + area.height - bottom > 2) {
        expect(hitTest(layout.tubes, midX, area.y + area.height - 1)).toBe(-1);
      }
    }
  });

  it('leaves a tall board mostly untappable for a single row of five tubes', () => {
    const { area, layout } = layoutFor(360, 800, 5);
    const first = layout.tubes[0];
    if (first === undefined) throw new Error('missing tube');
    expect(hitTest(layout.tubes, first.drawn.x + 2, area.y + 4)).toBe(-1);
    expect(hitTest(layout.tubes, first.drawn.x + 2, first.hit.y - 1)).toBe(-1);
    expect(hitTest(layout.tubes, first.drawn.x + 2, first.drawn.y + 4)).toBe(0);
  });
});
