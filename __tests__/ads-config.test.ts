import { resolveAdUnitId, type AdUnitIdOptions } from '@/config/ads';

const TEST_IDS = { rewarded: 'test-rewarded', interstitial: 'test-interstitial' };

const options = (overrides: Partial<AdUnitIdOptions>): AdUnitIdOptions => ({
  isDev: false,
  useTestIds: false,
  rewarded: 'prod-rewarded',
  interstitial: 'prod-interstitial',
  getTestIds: jest.fn(async () => TEST_IDS),
  ...overrides,
});

describe('resolveAdUnitId', () => {
  it('uses Google test units in development', async () => {
    await expect(resolveAdUnitId('rewarded', options({ isDev: true }))).resolves.toBe(
      'test-rewarded',
    );
  });

  it('uses test units when the test-id flag is set in a release build', async () => {
    await expect(resolveAdUnitId('interstitial', options({ useTestIds: true }))).resolves.toBe(
      'test-interstitial',
    );
  });

  it('uses production units in release without loading test ids', async () => {
    const opts = options({});
    await expect(resolveAdUnitId('rewarded', opts)).resolves.toBe('prod-rewarded');
    await expect(resolveAdUnitId('interstitial', opts)).resolves.toBe('prod-interstitial');
    expect(opts.getTestIds).not.toHaveBeenCalled();
  });

  it('disables a format when its production unit is missing', async () => {
    await expect(resolveAdUnitId('rewarded', options({ rewarded: '' }))).resolves.toBeNull();
  });
});
