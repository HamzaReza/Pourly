/**
 * Board constants shared by the pure game core (`src/game`). This module must stay free of
 * platform imports so the level generation script and Jest can load it directly.
 */

/** Segments per tube. */
export const CAPACITY = 4;

/** Upper bound on tubes on one board, including empty and +Tube tubes from generation. */
export const MAX_TUBES = 16;

/** Number of colors in the palette; color ids are `0..PALETTE_SIZE - 1`. */
export const PALETTE_SIZE = 14;
