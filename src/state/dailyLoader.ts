/**
 * The daily challenge board (spec §7.6): generated and validated at runtime, off the critical path,
 * with `createDailyTask` in idle-time slices. The board of one date is cached, so Home and the
 * Daily screen can prepare it while the player looks at them and Play opens it at once.
 */
import { createDailyTask, dailyLevelId, generateDaily } from '@/game/daily';
import { runTaskChunked } from '@/game/task';
import type { Level } from '@/game/types';

import { nextIdle, PREPARE_SLICE_MS } from './levelLoader';

let ready: Level | null = null;
const inflight = new Map<string, Promise<Level>>();

/** Today's board if it has been generated, else null. */
export const readyDaily = (localDate: string): Level | null =>
  ready !== null && ready.id === dailyLevelId(localDate) ? ready : null;

/** Generates the board of `localDate` in ≤ 6 ms idle slices. Concurrent calls share one task. */
export const prepareDaily = (localDate: string): Promise<Level> => {
  const cached = readyDaily(localDate);
  if (cached !== null) return Promise.resolve(cached);
  const existing = inflight.get(localDate);
  if (existing !== undefined) return existing;
  const promise = nextIdle()
    .then(() =>
      runTaskChunked(createDailyTask(localDate), {
        sliceMs: PREPARE_SLICE_MS,
        now: () => performance.now(),
        yieldFn: nextIdle,
      }),
    )
    .then((level) => {
      const board = level ?? generateDaily(localDate);
      ready = board;
      return board;
    })
    .finally(() => {
      inflight.delete(localDate);
    });
  inflight.set(localDate, promise);
  return promise;
};
