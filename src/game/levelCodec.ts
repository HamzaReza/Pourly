import { PALETTE_SIZE } from '@/config/game';

import { tubeKey } from './rules';
import type { Level, Segment, Tube } from './types';

/**
 * Compact text form of one level, version 1:
 *
 * `1;<id>;<level>;<seed>;<capacity>;<colors>;<emptyTubes>;<hidden‰>;<flags>;<minSolution>;<par>;<tubes>`
 *
 * Numbers are base 36. `flags` bit 0 = hard, bit 1 = fallback config. `<tubes>` lists tubes
 * separated by `,` (an empty tube is an empty string), bottom segment first, one char per segment:
 * `a..n` = revealed color 0..13, `A..N` = hidden color 0..13.
 */
export const LEVEL_CODEC_VERSION = '1';

const FIELD_COUNT = 12;
const ID_PATTERN = /^[a-z0-9-]+$/;
const NUMBER_PATTERN = /^[0-9a-z]+$/;
const FLAG_HARD = 1;
const FLAG_FALLBACK = 2;
const MAX_SEED = 0xffffffff;

const toBase36 = (value: number): string => value.toString(36);

export const encodeLevel = (level: Level): string => {
  if (!ID_PATTERN.test(level.id)) {
    throw new Error(`Level id "${level.id}" must match ${ID_PATTERN}`);
  }
  const { config } = level;
  const flags = (config.hard ? FLAG_HARD : 0) | (config.fallback ? FLAG_FALLBACK : 0);
  return [
    LEVEL_CODEC_VERSION,
    level.id,
    toBase36(config.level),
    toBase36(level.seed),
    toBase36(config.capacity),
    toBase36(config.colors),
    toBase36(config.emptyTubes),
    toBase36(Math.round(config.hiddenRatio * 1000)),
    toBase36(flags),
    toBase36(config.minSolutionLength),
    toBase36(level.par),
    level.board.tubes.map(tubeKey).join(','),
  ].join(';');
};

const fail = (reason: string): never => {
  throw new Error(`Malformed level string: ${reason}`);
};

const parseNumber = (raw: string, name: string, min: number, max: number): number => {
  if (!NUMBER_PATTERN.test(raw)) fail(`${name} "${raw}" is not base 36`);
  const value = parseInt(raw, 36);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${name} ${value} is outside ${min}..${max}`);
  }
  return value;
};

const parseSegment = (code: number): Segment => {
  if (code >= 97 && code < 97 + PALETTE_SIZE) return { color: code - 97, hidden: false };
  if (code >= 65 && code < 65 + PALETTE_SIZE) return { color: code - 65, hidden: true };
  return fail(`invalid segment char "${String.fromCharCode(code)}"`);
};

const parseTube = (raw: string, capacity: number): Tube => {
  if (raw.length > capacity) fail(`tube "${raw}" exceeds capacity ${capacity}`);
  const tube: Segment[] = [];
  for (let i = 0; i < raw.length; i += 1) tube.push(parseSegment(raw.charCodeAt(i)));
  if (tube[tube.length - 1]?.hidden === true) fail(`tube "${raw}" has a hidden top`);
  return tube;
};

/** Parses a string produced by `encodeLevel`. Throws a descriptive error on malformed input. */
export const decodeLevel = (encoded: string): Level => {
  const fields = encoded.split(';');
  if (fields.length !== FIELD_COUNT) fail(`expected ${FIELD_COUNT} fields, got ${fields.length}`);
  const [
    version,
    id,
    levelRaw,
    seedRaw,
    capRaw,
    colorsRaw,
    emptyRaw,
    hiddenRaw,
    flagsRaw,
    minRaw,
    parRaw,
    tubesRaw,
  ] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== LEVEL_CODEC_VERSION) fail(`unsupported version "${version}"`);
  if (!ID_PATTERN.test(id)) fail(`invalid id "${id}"`);
  const levelNumber = parseNumber(levelRaw, 'level', 0, Number.MAX_SAFE_INTEGER);
  const seed = parseNumber(seedRaw, 'seed', 0, MAX_SEED);
  const capacity = parseNumber(capRaw, 'capacity', 1, 64);
  const colors = parseNumber(colorsRaw, 'colors', 1, PALETTE_SIZE);
  const emptyTubes = parseNumber(emptyRaw, 'emptyTubes', 0, 64);
  const hiddenPermille = parseNumber(hiddenRaw, 'hidden ratio', 0, 1000);
  const flags = parseNumber(flagsRaw, 'flags', 0, FLAG_HARD | FLAG_FALLBACK);
  const minSolutionLength = parseNumber(minRaw, 'minSolutionLength', 0, Number.MAX_SAFE_INTEGER);
  const par = parseNumber(parRaw, 'par', 0, Number.MAX_SAFE_INTEGER);

  const tubes = tubesRaw.split(',').map((raw) => parseTube(raw, capacity));
  if (tubes.length !== colors + emptyTubes) {
    fail(`expected ${colors + emptyTubes} tubes, got ${tubes.length}`);
  }
  const counts = new Map<number, number>();
  for (const tube of tubes) {
    for (const segment of tube) counts.set(segment.color, (counts.get(segment.color) ?? 0) + 1);
  }
  if (counts.size !== colors) fail(`expected ${colors} colors, got ${counts.size}`);
  for (const [color, count] of counts) {
    if (count !== capacity) fail(`color ${color} has ${count} segments, expected ${capacity}`);
  }

  return {
    id,
    seed,
    config: {
      level: levelNumber,
      colors,
      emptyTubes,
      hiddenRatio: hiddenPermille / 1000,
      hard: (flags & FLAG_HARD) !== 0,
      capacity,
      minSolutionLength,
      fallback: (flags & FLAG_FALLBACK) !== 0,
    },
    board: { tubes, capacity },
    par,
  };
};
