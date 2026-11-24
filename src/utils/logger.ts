type LogArgs = readonly unknown[];

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/** Dev-only logger. Every method is a no-op in release builds. */
export const logger = {
  debug: (...args: LogArgs): void => {
    if (isDev) console.debug('[pourly]', ...args);
  },
  info: (...args: LogArgs): void => {
    if (isDev) console.info('[pourly]', ...args);
  },
  warn: (...args: LogArgs): void => {
    if (isDev) console.warn('[pourly]', ...args);
  },
  error: (...args: LogArgs): void => {
    if (isDev) console.error('[pourly]', ...args);
  },
};
