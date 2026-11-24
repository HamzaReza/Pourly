import { MAX_TUBES } from '@/config/game';
import { bandFor, fallbackConfig, getLevelConfig } from '@/game/difficulty';
import { buildCandidate, generateLevel, getLevel, levelSeed } from '@/game/generator';
import { decodeLevel, encodeLevel } from '@/game/levelCodec';
import { LEVELS } from '@/game/levels.generated';
import { applyPour, boardKey, isComplete, isUniform, isWon } from '@/game/rules';
import { GENERATION_NODE_CAP, solve } from '@/game/solver';
import { computeStars } from '@/game/stars';
import type { Board, Level, Move } from '@/game/types';

const replay = (start: Board, moves: readonly Move[]): Board =>
  moves.reduce((current, move) => applyPour(current, move).board, start);

const generate = (level: number): Level => generateLevel(getLevelConfig(level), levelSeed(level));

describe('generator', () => {
  it('produces identical encodings for the same seed', () => {
    for (const level of [5, 37, 120]) {
      expect(encodeLevel(generate(level))).toBe(encodeLevel(generate(level)));
    }
  });

  it('produces different boards for different seeds', () => {
    const config = getLevelConfig(40);
    expect(boardKey(buildCandidate(config, 1))).not.toBe(boardKey(buildCandidate(config, 2)));
    // Base seeds 50+ apart never share an attempt seed (seed + 1 retries).
    const a = generateLevel(config, 1);
    const b = generateLevel(config, 1_000);
    expect(boardKey(a.board)).not.toBe(boardKey(b.board));
  });

  it('matches the committed levels when regenerated', () => {
    for (const level of [1, 10, 38, 75, 150]) {
      expect(encodeLevel(generate(level))).toBe(LEVELS[level - 1]);
    }
  });

  it('every precomputed board is well formed and meets its minimum length', () => {
    for (const encoded of LEVELS) {
      const level = decodeLevel(encoded);
      const counts = new Map<number, number>();
      for (const tube of level.board.tubes) {
        if (tube.length > 0) expect(tube[tube.length - 1]?.hidden).toBe(false);
        expect(tube.length === level.board.capacity && isUniform(tube)).toBe(false);
        expect(isComplete(tube, level.board.capacity)).toBe(false);
        for (const segment of tube) {
          counts.set(segment.color, (counts.get(segment.color) ?? 0) + 1);
        }
      }
      expect(counts.size).toBe(level.config.colors);
      for (const count of counts.values()) expect(count).toBe(level.board.capacity);
      expect(level.par).toBeGreaterThanOrEqual(level.config.minSolutionLength);
    }
  });
});

describe('difficulty', () => {
  it('ramps monotonically and respects the spec bounds', () => {
    let previous = getLevelConfig(1);
    for (let level = 1; level <= 600; level += 1) {
      const config = getLevelConfig(level);
      expect(config.colors).toBeGreaterThanOrEqual(previous.colors);
      if (level > 1 && bandFor(level) === bandFor(level - 1)) {
        expect(config.hiddenRatio).toBeGreaterThanOrEqual(previous.hiddenRatio);
      }
      if (level < 25) expect(config.hiddenRatio).toBe(0);
      expect(config.hard).toBe(level % 10 === 0);
      expect(config.emptyTubes).toBe(level % 10 === 0 ? 1 : 2);
      expect(config.colors + config.emptyTubes).toBeLessThanOrEqual(MAX_TUBES);
      previous = config;
    }
    expect(getLevelConfig(25).hiddenRatio).toBe(0.1);
    expect(() => getLevelConfig(0)).toThrow();
  });

  it('fallbackConfig adds a tube, or drops a color past 16 tubes', () => {
    const normal = fallbackConfig(getLevelConfig(61));
    expect(normal.emptyTubes).toBe(3);
    expect(normal.colors).toBe(getLevelConfig(61).colors);
    expect(normal.fallback).toBe(true);
    const crowded = fallbackConfig(getLevelConfig(299));
    expect(crowded.emptyTubes).toBe(3);
    expect(crowded.colors).toBe(13);
    expect(crowded.colors + crowded.emptyTubes).toBe(MAX_TUBES);
  });
});

describe('precomputed levels', () => {
  it('all 300 precomputed levels re-verify solvable and replay to a win', () => {
    expect(LEVELS).toHaveLength(300);
    LEVELS.forEach((encoded) => {
      const level = decodeLevel(encoded);
      const result = solve(level.board, { nodeCap: GENERATION_NODE_CAP });
      expect(result.solvable).toBe(true);
      expect(isWon(replay(level.board, result.moves))).toBe(true);
    });
  }, 60_000);

  it('getLevel decodes precomputed levels and generates and caches above 300', () => {
    const first = getLevel(1);
    expect(first).toEqual(decodeLevel(LEVELS[0] ?? ''));
    expect(getLevel(1)).toBe(first);
    const runtime = getLevel(301);
    expect(runtime.config.level).toBe(301);
    expect(runtime.id).toBe('level-301');
    expect(getLevel(301)).toBe(runtime);
  });
});

describe('levelCodec', () => {
  it('round-trips exactly', () => {
    for (const encoded of LEVELS) expect(encodeLevel(decodeLevel(encoded))).toBe(encoded);
    const level = generate(42);
    expect(decodeLevel(encodeLevel(level))).toEqual(level);
  });

  it('throws a clear error on malformed strings', () => {
    const good = LEVELS[0] ?? '';
    const fields = good.split(';');
    const withField = (index: number, value: string): string =>
      fields.map((field, i) => (i === index ? value : field)).join(';');
    const tubes = fields[11] ?? '';
    const malformed = [
      '',
      fields.slice(0, 11).join(';'),
      withField(0, '2'),
      withField(1, 'Level 1'),
      withField(3, 'zz!'),
      withField(11, `${tubes},`),
      withField(
        11,
        tubes.replace(/^./, (ch) => (ch === 'a' ? 'b' : 'a')),
      ),
      withField(
        11,
        tubes.replace(
          /^([a-n]+)([a-n])/,
          (_, rest: string, top: string) => `${rest}${top.toUpperCase()}`,
        ),
      ),
    ];
    for (const value of malformed) {
      expect(() => decodeLevel(value)).toThrow(/Malformed level string/);
    }
  });
});

describe('stars', () => {
  it('uses ceil(par × 1.4) and ceil(par × 2) thresholds', () => {
    expect(computeStars(14, 10)).toBe(3);
    expect(computeStars(15, 10)).toBe(2);
    expect(computeStars(20, 10)).toBe(2);
    expect(computeStars(21, 10)).toBe(1);
    expect(computeStars(5, 3)).toBe(3);
    expect(computeStars(6, 3)).toBe(2);
  });
});
