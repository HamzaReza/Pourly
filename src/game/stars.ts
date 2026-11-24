import type { StarCount } from '@/state/progressModel';

/**
 * Stars for finishing in `moves` pours: 3 if `moves ≤ ceil(par × 1.4)`, 2 if
 * `moves ≤ ceil(par × 2)`, else 1. Thresholds use integer math (`ceil(par × 7 / 5)`), so no float
 * rounding can move a boundary. Hints do not affect stars.
 */
export const computeStars = (moves: number, par: number): StarCount => {
  const threeStarMax = Math.ceil((par * 7) / 5);
  const twoStarMax = par * 2;
  if (moves <= threeStarMax) return 3;
  if (moves <= twoStarMax) return 2;
  return 1;
};
