/**
 * The in-progress game session: types, pure reducers and the compact, validated resume snapshot.
 * `gameStore.ts` wraps these in a Zustand store; everything here is pure and takes the clock as an
 * argument, so it is testable without React or storage.
 */
import { PALETTE_SIZE } from '@/config/game';
import {
  addEmptyTube,
  applyPour,
  canPour,
  createHistory,
  isStuck,
  isWon,
  tubeKey,
  undo as undoHistory,
  type History,
} from '@/game/rules';
import type { Board, Level, Move, PourOutcome, Segment, Tube } from '@/game/types';

import type { StarCount } from './progressModel';

export type GameMode = 'level' | 'daily';

export type GameStatus = 'playing' | 'won' | 'stuck' | 'paused';

/** The status a pause returns to. */
export type ActiveStatus = 'playing' | 'stuck';

export interface LevelResult {
  readonly stars: StarCount;
  /** Coins granted for the win (before any doubling). */
  readonly coins: number;
  /** Completed through the SKIP_LEVEL ad (1★, no coins). */
  readonly skipped: boolean;
  /** The DOUBLE_COINS ad was watched. */
  readonly doubled: boolean;
}

export interface GameSession {
  readonly mode: GameMode;
  /** `level-<n>` or `daily-YYYY-MM-DD`. */
  readonly levelId: string;
  /** Level number; 0 in daily mode. */
  readonly levelNumber: number;
  readonly par: number;
  readonly hard: boolean;
  /** The level's opening board (restart target), without the extra tube. */
  readonly initialBoard: Board;
  readonly history: History;
  /** Pours on the current line of play (an undo takes one back); drives the stars. */
  readonly moves: number;
  /** Undos taken this attempt, free and paid (the first `freeUndosPerLevel` are free). */
  readonly undosUsed: number;
  /** Hints shown on this level, across restarts. */
  readonly hintsUsed: number;
  /** The +Tube power-up is in use this attempt. */
  readonly extraTubeUsed: boolean;
  readonly restartsThisLevel: number;
  /** Inventory, coins or an ad were spent this attempt (restart then asks for confirmation). */
  readonly paidResourceUsedThisAttempt: boolean;
  /** Epoch ms when the level was first loaded. */
  readonly startedAt: number;
  /** Time on the level banked before `runningSince` (pause-aware). */
  readonly elapsedMs: number;
  /** Epoch ms when the clock last started, or null while it is stopped. */
  readonly runningSince: number | null;
  readonly status: GameStatus;
  /** What `resume` returns to while paused. */
  readonly pausedFrom: ActiveStatus | null;
  /** Set once the level is won or skipped. */
  readonly result: LevelResult | null;
}

/** Playing or stuck: the board is live. */
export const isActive = (status: GameStatus): status is ActiveStatus =>
  status === 'playing' || status === 'stuck';

const boardStatus = (board: Board): ActiveStatus => (isStuck(board) ? 'stuck' : 'playing');

/** Time on the level, pause-aware. */
export const elapsedOf = (session: GameSession, now: number): number =>
  session.elapsedMs + (session.runningSince === null ? 0 : Math.max(0, now - session.runningSince));

/** Banks the running time and stops the clock. */
const stopClock = (session: GameSession, now: number): GameSession =>
  session.runningSince === null
    ? session
    : { ...session, elapsedMs: elapsedOf(session, now), runningSince: null };

export const createSession = (level: Level, mode: GameMode, now: number): GameSession => ({
  mode,
  levelId: level.id,
  levelNumber: mode === 'level' ? level.config.level : 0,
  par: level.par,
  hard: level.config.hard,
  initialBoard: level.board,
  history: createHistory(level.board),
  moves: 0,
  undosUsed: 0,
  hintsUsed: 0,
  extraTubeUsed: false,
  restartsThisLevel: 0,
  paidResourceUsedThisAttempt: false,
  startedAt: now,
  elapsedMs: 0,
  runningSince: now,
  status: boardStatus(level.board),
  pausedFrom: null,
  result: null,
});

export interface PourStep {
  readonly session: GameSession;
  readonly outcome: PourOutcome;
}

/**
 * Commits a pour on a live board. Detects the win (clock stops) and stuck boards. Null when the
 * session is not live or the pour is illegal.
 */
export const reducePour = (session: GameSession, move: Move, now: number): PourStep | null => {
  if (!isActive(session.status)) return null;
  const board = session.history.current;
  if (!canPour(board, move.from, move.to)) return null;
  const outcome = applyPour(board, move);
  const history: History = { current: outcome.board, past: [...session.history.past, board] };
  const moved: GameSession = { ...session, history, moves: session.moves + 1 };
  if (isWon(outcome.board)) {
    return { session: { ...stopClock(moved, now), status: 'won' }, outcome };
  }
  return { session: { ...moved, status: boardStatus(outcome.board) }, outcome };
};

/** Takes back the last pour (reveal state included). Null when there is nothing to undo. */
export const reduceUndo = (session: GameSession, paid: boolean): GameSession | null => {
  if (!isActive(session.status)) return null;
  const history = undoHistory(session.history);
  if (history === null) return null;
  return {
    ...session,
    history,
    moves: Math.max(0, session.moves - 1),
    undosUsed: session.undosUsed + 1,
    paidResourceUsedThisAttempt: session.paidResourceUsedThisAttempt || paid,
    status: boardStatus(history.current),
  };
};

/**
 * Back to the opening board. The attempt's counters (moves, undos, extra tube, paid flag) reset;
 * time on the level and hints used carry over. Allowed while live or paused.
 */
export const reduceRestart = (session: GameSession, now: number): GameSession | null => {
  if (session.status === 'won') return null;
  return {
    ...session,
    history: createHistory(session.initialBoard),
    moves: 0,
    undosUsed: 0,
    extraTubeUsed: false,
    paidResourceUsedThisAttempt: false,
    restartsThisLevel: session.restartsThisLevel + 1,
    runningSince: session.runningSince ?? now,
    status: boardStatus(session.initialBoard),
    pausedFrom: null,
  };
};

/**
 * Adds the extra empty tube to the current board and to every earlier snapshot, so an undo never
 * removes it. Once per attempt. Always counts as a paid resource.
 */
export const reduceAddTube = (session: GameSession): GameSession | null => {
  if (!isActive(session.status) || session.extraTubeUsed) return null;
  const current = addEmptyTube(session.history.current);
  return {
    ...session,
    history: { current, past: session.history.past.map(addEmptyTube) },
    extraTubeUsed: true,
    paidResourceUsedThisAttempt: true,
    status: boardStatus(current),
  };
};

/** A hint was shown (always a paid resource). */
export const reduceHintUsed = (session: GameSession): GameSession => ({
  ...session,
  hintsUsed: session.hintsUsed + 1,
  paidResourceUsedThisAttempt: true,
});

export const reducePause = (session: GameSession, now: number): GameSession => {
  if (!isActive(session.status)) return session;
  return { ...stopClock(session, now), status: 'paused', pausedFrom: session.status };
};

/** Leaves the pause (or restarts a stopped clock after a relaunch). */
export const reduceResume = (session: GameSession, now: number): GameSession => {
  if (session.status === 'won') return session;
  const status: ActiveStatus =
    session.status === 'paused' ? (session.pausedFrom ?? 'playing') : session.status;
  return { ...session, status, pausedFrom: null, runningSince: session.runningSince ?? now };
};

/** Records the win result (stars and coins computed by the flow). */
export const reduceMarkWon = (session: GameSession, result: LevelResult): GameSession | null =>
  session.status === 'won' ? { ...session, result } : null;

/** Ends the level through the SKIP_LEVEL ad: 1★, no coins. */
export const reduceSkip = (session: GameSession, now: number): GameSession | null => {
  if (session.status === 'won') return null;
  return {
    ...stopClock(session, now),
    status: 'won',
    pausedFrom: null,
    result: { stars: 1, coins: 0, skipped: true, doubled: false },
  };
};

/** True when the session is an unfinished level-mode game for `progressLevel`. */
export const isResumable = (session: GameSession | null, progressLevel: number): boolean =>
  session !== null &&
  session.mode === 'level' &&
  session.status !== 'won' &&
  session.levelNumber === progressLevel;

// ---------------------------------------------------------------------------------------------
// Resume snapshot
// ---------------------------------------------------------------------------------------------

export const SNAPSHOT_VERSION = 1;

/** Largest capacity and history the decoder accepts (guards against corrupt data). */
const MAX_CAPACITY = 8;
const MAX_TUBES = 17;
const MAX_HISTORY = 5000;

/** Compact board: one string per tube, `a..n` revealed and `A..N` hidden (see `tubeKey`). */
export type WireBoard = readonly string[];

export interface WireSession {
  readonly mode: GameMode;
  readonly levelId: string;
  readonly levelNumber: number;
  readonly par: number;
  readonly hard: boolean;
  readonly capacity: number;
  readonly initial: WireBoard;
  readonly current: WireBoard;
  readonly past: readonly WireBoard[];
  readonly moves: number;
  readonly undosUsed: number;
  readonly hintsUsed: number;
  readonly extraTubeUsed: boolean;
  readonly restartsThisLevel: number;
  readonly paidResourceUsedThisAttempt: boolean;
  readonly startedAt: number;
  readonly elapsedMs: number;
  readonly status: ActiveStatus | 'paused';
  readonly pausedFrom: ActiveStatus | null;
}

/** Boards are immutable and shared across history, so each is encoded once. */
const wireCache = new WeakMap<Board, WireBoard>();

export const encodeBoard = (board: Board): WireBoard => {
  const cached = wireCache.get(board);
  if (cached !== undefined) return cached;
  const wire = board.tubes.map(tubeKey);
  wireCache.set(board, wire);
  return wire;
};

/**
 * Snapshot of an unfinished session, or null for none or a finished one. The running clock is
 * banked into `elapsedMs`; a restored session starts with its clock stopped.
 */
export const encodeSession = (session: GameSession | null, now: number): WireSession | null => {
  if (session === null || session.status === 'won') return null;
  return {
    mode: session.mode,
    levelId: session.levelId,
    levelNumber: session.levelNumber,
    par: session.par,
    hard: session.hard,
    capacity: session.initialBoard.capacity,
    initial: encodeBoard(session.initialBoard),
    current: encodeBoard(session.history.current),
    past: session.history.past.map(encodeBoard),
    moves: session.moves,
    undosUsed: session.undosUsed,
    hintsUsed: session.hintsUsed,
    extraTubeUsed: session.extraTubeUsed,
    restartsThisLevel: session.restartsThisLevel,
    paidResourceUsedThisAttempt: session.paidResourceUsedThisAttempt,
    startedAt: session.startedAt,
    elapsedMs: elapsedOf(session, now),
    status: session.status,
    pausedFrom: session.pausedFrom,
  };
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const HIDDEN_BASE = 65;
const REVEALED_BASE = 97;

const decodeTube = (value: unknown, capacity: number): Tube | null => {
  if (typeof value !== 'string' || value.length > capacity) return null;
  const tube: Segment[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const hidden = code >= HIDDEN_BASE && code < HIDDEN_BASE + PALETTE_SIZE;
    const revealed = code >= REVEALED_BASE && code < REVEALED_BASE + PALETTE_SIZE;
    if (!hidden && !revealed) return null;
    tube.push({ color: code - (hidden ? HIDDEN_BASE : REVEALED_BASE), hidden });
  }
  const top = tube[tube.length - 1];
  if (top !== undefined && top.hidden) return null;
  return tube;
};

const colorCounts = (board: Board): string => {
  const counts = new Array<number>(PALETTE_SIZE).fill(0);
  for (const tube of board.tubes) {
    for (const segment of tube) counts[segment.color] = (counts[segment.color] ?? 0) + 1;
  }
  return counts.join(',');
};

const decodeBoard = (value: unknown, capacity: number, tubeCount: number): Board | null => {
  if (!Array.isArray(value) || value.length !== tubeCount) return null;
  const tubes: Tube[] = [];
  for (const item of value) {
    const tube = decodeTube(item, capacity);
    if (tube === null) return null;
    tubes.push(tube);
  }
  return { tubes, capacity };
};

const isMode = (value: unknown): value is GameMode => value === 'level' || value === 'daily';

const isActiveStatus = (value: unknown): value is ActiveStatus =>
  value === 'playing' || value === 'stuck';

/**
 * Validates a stored snapshot and rebuilds the session. Every board must have the opening
 * board's tube count (plus one with the extra tube) and exactly its colors; anything malformed
 * yields null so the player simply starts the level fresh.
 */
export const decodeSession = (value: unknown): GameSession | null => {
  if (!isRecord(value)) return null;
  const { capacity, levelNumber, levelId, mode } = value;
  if (!isMode(mode) || typeof levelId !== 'string' || levelId.length === 0) return null;
  if (!isCount(levelNumber) || (mode === 'level' && levelId !== `level-${levelNumber}`)) {
    return null;
  }
  if (!isCount(capacity) || capacity < 1 || capacity > MAX_CAPACITY) return null;
  if (!Array.isArray(value.initial) || value.initial.length > MAX_TUBES - 1) return null;
  const initial = decodeBoard(value.initial, capacity, value.initial.length);
  if (initial === null || initial.tubes.length === 0) return null;
  if (typeof value.extraTubeUsed !== 'boolean') return null;
  const tubeCount = initial.tubes.length + (value.extraTubeUsed ? 1 : 0);
  const colors = colorCounts(initial);
  const decodeLive = (wire: unknown): Board | null => {
    const board = decodeBoard(wire, capacity, tubeCount);
    return board !== null && colorCounts(board) === colors ? board : null;
  };
  const current = decodeLive(value.current);
  if (current === null || isWon(current)) return null;
  if (!Array.isArray(value.past) || value.past.length > MAX_HISTORY) return null;
  const past: Board[] = [];
  for (const wire of value.past) {
    const board = decodeLive(wire);
    if (board === null) return null;
    past.push(board);
  }
  const { moves, undosUsed, hintsUsed, restartsThisLevel, par, hard } = value;
  if (!isCount(moves) || !isCount(undosUsed) || !isCount(hintsUsed)) return null;
  if (!isCount(restartsThisLevel) || !isCount(par) || typeof hard !== 'boolean') return null;
  if (typeof value.paidResourceUsedThisAttempt !== 'boolean') return null;
  if (!isTime(value.startedAt) || !isTime(value.elapsedMs)) return null;
  const { status, pausedFrom } = value;
  if (status !== 'paused' && !isActiveStatus(status)) return null;
  if (pausedFrom !== null && !isActiveStatus(pausedFrom)) return null;
  const restoredStatus: GameStatus =
    status === 'paused' ? status : isStuck(current) ? 'stuck' : 'playing';
  return {
    mode,
    levelId,
    levelNumber,
    par,
    hard,
    initialBoard: initial,
    history: { current, past },
    moves,
    undosUsed,
    hintsUsed,
    extraTubeUsed: value.extraTubeUsed,
    restartsThisLevel,
    paidResourceUsedThisAttempt: value.paidResourceUsedThisAttempt,
    startedAt: value.startedAt,
    elapsedMs: value.elapsedMs,
    runningSince: null,
    status: restoredStatus,
    pausedFrom: status === 'paused' ? (pausedFrom ?? 'playing') : null,
    result: null,
  };
};

/** What the game store persists under its own key. */
export interface PersistedGame {
  readonly snapshot: WireSession | null;
}

type SnapshotStep = (state: UnknownRecord) => UnknownRecord;

/**
 * Structural snapshot migrations keyed by the version they upgrade FROM. Version 1 is the first
 * shape; add `n: (s) => ...` when version n+1 changes it. Unknown versions are dropped.
 */
const SNAPSHOT_STEPS: Readonly<Record<number, SnapshotStep>> = {};

/** Upgrades a stored snapshot to `SNAPSHOT_VERSION`; anything unreadable becomes no snapshot. */
export const migrateGamePersisted = (persisted: unknown, fromVersion: number): PersistedGame => {
  if (!isRecord(persisted)) return { snapshot: null };
  if (!Number.isInteger(fromVersion) || fromVersion < 1 || fromVersion > SNAPSHOT_VERSION) {
    return { snapshot: null };
  }
  let state = persisted;
  for (let version = fromVersion; version < SNAPSHOT_VERSION; version += 1) {
    const step = SNAPSHOT_STEPS[version];
    if (step === undefined) return { snapshot: null };
    state = step(state);
  }
  const session = decodeSession(state.snapshot);
  return { snapshot: session === null ? null : encodeSession(session, 0) };
};

/** Restores the session from persisted data, validating every field. */
export const restoreSession = (persisted: unknown): GameSession | null =>
  isRecord(persisted) ? decodeSession(persisted.snapshot) : null;
