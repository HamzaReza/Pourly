import { logger } from '@/utils/logger';
import { defaultAnalyticsAdapter, setAnalyticsAdapter, track } from '@/services/analytics';

describe('analytics', () => {
  afterEach(() => {
    setAnalyticsAdapter(defaultAnalyticsAdapter);
    jest.restoreAllMocks();
  });

  it('logs through the default adapter in development', () => {
    const debug = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
    track('level_restart', { level: 4, restarts: 2 });
    expect(debug).toHaveBeenCalledWith('analytics', 'level_restart', { level: 4, restarts: 2 });
  });

  it('is a no-op in production', () => {
    const debug = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const dev = __DEV__;
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
      writable: true,
    });
    try {
      track('app_open', { session: 1 });
    } finally {
      Object.defineProperty(globalThis, '__DEV__', {
        value: dev,
        configurable: true,
        writable: true,
      });
    }
    expect(debug).not.toHaveBeenCalled();
  });

  it('routes events to an installed adapter and survives adapter errors', () => {
    const sink = jest.fn();
    setAnalyticsAdapter({ track: sink });
    track('hint_used', { level: 2, source: 'coins' });
    expect(sink).toHaveBeenCalledWith('hint_used', { level: 2, source: 'coins' });
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setAnalyticsAdapter({
      track: () => {
        throw new Error('backend down');
      },
    });
    expect(() => track('tutorial_step', { level: 1, step: 1 })).not.toThrow();
  });
});
