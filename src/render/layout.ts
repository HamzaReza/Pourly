/**
 * Board geometry (spec §8.2). Pure: no React Native imports, so Jest, scripts and the UI thread
 * can all use it. `hitTest` is a worklet so taps resolve on the UI thread.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TubeRect {
  /** Where the tube is drawn (resting position, before any selection lift). */
  readonly drawn: Rect;
  /**
   * Touch target: at least `MIN_HIT_WIDTH` wide, includes the gaps beside the tube, never overlaps
   * another. Vertically it covers the tube (with its lift headroom and shadow) plus `HIT_SLOP_Y`,
   * so taps in the empty board space above or below the tubes select nothing.
   */
  readonly hit: Rect;
  readonly row: number;
  readonly col: number;
}

export interface LayoutInput {
  /** Board area with safe-area insets and HUD bars already removed. */
  readonly area: Rect;
  readonly tubeCount: number;
  readonly capacity: number;
}

export interface BoardLayout {
  readonly tubes: readonly TubeRect[];
  readonly rows: number;
  readonly cols: number;
  readonly tubeWidth: number;
  readonly tubeHeight: number;
  /** Height of one liquid segment. */
  readonly segmentHeight: number;
  /** Glass thickness; the liquid interior is the tube rect inset by this much. */
  readonly wall: number;
}

/** Selection lift in dp (spec §8.3). */
export const SELECTION_LIFT = 14;
/** Space kept free above every row: the lift plus room for the glow and the cap. */
export const ROW_HEADROOM = SELECTION_LIFT + 10;
/** Space kept free below every row for the soft shadow. */
export const ROW_FOOTROOM = 8;
/** Extra touch margin above and below a row of tubes (clamped to half the gap between rows). */
export const HIT_SLOP_Y = 12;
/** Minimum hit-rect width (spec §10, §16). */
export const MIN_HIT_WIDTH = 44;
export const MAX_TUBE_WIDTH = 72;
/** Ideal segment height relative to the tube width. */
export const SEGMENT_RATIO = 0.82;
/** Empty space above a full tube, in segments. */
export const HEADSPACE_SEGMENTS = 0.5;
/** Clamp for tube height / tube width. */
export const MIN_TUBE_ASPECT = 2.4;
export const MAX_TUBE_ASPECT = 4.6;

/** The glass lip: how far it sticks out past each wall and how far it rises above the tube top. */
export const tubeLip = (wall: number): { overhang: number; rise: number; height: number } => {
  const height = Math.max(3, wall * 1.6);
  return { overhang: wall * 0.6, rise: height * 0.45, height };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Rows by tube count: ≤ 5 → 1, ≤ 12 → 2, otherwise 3. */
export const rowsFor = (tubeCount: number): number => {
  if (tubeCount <= 5) return 1;
  if (tubeCount <= 12) return 2;
  return 3;
};

const wallFor = (tubeWidth: number): number => clamp(tubeWidth * 0.07, 1.5, 4);

const tubeHeightFor = (segmentHeight: number, capacity: number, wall: number): number =>
  segmentHeight * (capacity + HEADSPACE_SEGMENTS) + wall;

const segmentHeightFor = (tubeHeight: number, capacity: number, wall: number): number =>
  (tubeHeight - wall) / (capacity + HEADSPACE_SEGMENTS);

export const computeBoardLayout = ({ area, tubeCount, capacity }: LayoutInput): BoardLayout => {
  const count = Math.max(0, Math.floor(tubeCount));
  const rows = rowsFor(count);
  const cols = Math.max(1, Math.ceil(count / rows));
  const gapX = clamp(area.width * 0.03, 6, 24);
  const rowGap = clamp(area.height * 0.03, 8, 32);

  let tubeWidth = Math.max(1, Math.min(MAX_TUBE_WIDTH, (area.width - gapX * (cols + 1)) / cols));
  let wall = wallFor(tubeWidth);
  let tubeHeight = tubeHeightFor(tubeWidth * SEGMENT_RATIO, capacity, wall);
  tubeHeight = clamp(tubeHeight, tubeWidth * MIN_TUBE_ASPECT, tubeWidth * MAX_TUBE_ASPECT);

  const maxRowBlock = (area.height - rowGap * (rows - 1)) / rows;
  const maxTubeHeight = Math.max(1, maxRowBlock - ROW_HEADROOM - ROW_FOOTROOM);
  if (tubeHeight > maxTubeHeight) {
    tubeHeight = maxTubeHeight;
    if (tubeHeight < tubeWidth * MIN_TUBE_ASPECT) {
      tubeWidth = tubeHeight / MIN_TUBE_ASPECT;
      wall = wallFor(tubeWidth);
    }
  }
  const segmentHeight = segmentHeightFor(tubeHeight, capacity, wall);

  const idealPitch = tubeWidth + Math.max(gapX, tubeWidth * 0.55);
  const pitch = Math.min(area.width / cols, Math.max(idealPitch, MIN_HIT_WIDTH));
  const rowBlock = ROW_HEADROOM + tubeHeight + ROW_FOOTROOM;
  const boardHeight = rows * rowBlock + (rows - 1) * rowGap;
  const top = area.y + Math.max(0, (area.height - boardHeight) / 2);
  const areaBottom = area.y + area.height;

  const tubes: TubeRect[] = [];
  for (let row = 0; row < rows; row += 1) {
    const first = row * cols;
    const inRow = Math.min(cols, count - first);
    if (inRow <= 0) break;
    const rowTop = top + row * (rowBlock + rowGap);
    const startX = area.x + (area.width - inRow * pitch) / 2;
    const slopTop = row === 0 ? HIT_SLOP_Y : Math.min(HIT_SLOP_Y, rowGap / 2);
    const slopBottom = row === rows - 1 ? HIT_SLOP_Y : Math.min(HIT_SLOP_Y, rowGap / 2);
    const hitTop = Math.max(area.y, rowTop - slopTop);
    const hitBottom = Math.min(areaBottom, rowTop + rowBlock + slopBottom);
    for (let col = 0; col < inRow; col += 1) {
      const cellX = startX + col * pitch;
      tubes.push({
        drawn: {
          x: cellX + (pitch - tubeWidth) / 2,
          y: rowTop + ROW_HEADROOM,
          width: tubeWidth,
          height: tubeHeight,
        },
        hit: { x: cellX, y: hitTop, width: pitch, height: hitBottom - hitTop },
        row,
        col,
      });
    }
  }

  return { tubes, rows, cols, tubeWidth, tubeHeight, segmentHeight, wall };
};

/** Drawn and hit rects per tube, in board order. */
export const getTubeRects = (input: LayoutInput): readonly TubeRect[] =>
  computeBoardLayout(input).tubes;

/** Index of the tube whose hit rect contains (x, y), or -1. Rects are half-open on the far edges. */
export const hitTest = (rects: readonly TubeRect[], x: number, y: number): number => {
  'worklet';
  for (let i = 0; i < rects.length; i += 1) {
    const tube = rects[i];
    if (tube === undefined) continue;
    const { hit } = tube;
    if (x >= hit.x && x < hit.x + hit.width && y >= hit.y && y < hit.y + hit.height) return i;
  }
  return -1;
};
