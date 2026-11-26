import * as Font from 'expo-font';

import { BRAND_FONT, brandTitleFont, loadBrandFont, type BrandFontConfig } from '@/ui/brandFont';
import { logger } from '@/utils/logger';

jest.mock('expo-font', () => ({ loadAsync: jest.fn(), isLoaded: jest.fn(() => false) }));

const loadAsync = Font.loadAsync as jest.Mock;
const isLoaded = Font.isLoaded as jest.Mock;

const config = (family: string): BrandFontConfig => ({ family, source: 1, letterSpacing: 0.5 });

beforeEach(() => {
  jest.clearAllMocks();
  isLoaded.mockReturnValue(false);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('brand font', () => {
  it('the wordmark uses Grandstander ExtraBold', () => {
    expect(BRAND_FONT).toMatchObject({ family: 'Grandstander_800ExtraBold' });
  });

  it('without a configured font nothing loads and the title uses the heavy fallback', async () => {
    await expect(loadBrandFont(null)).resolves.toBe(false);
    expect(loadAsync).not.toHaveBeenCalled();
    expect(brandTitleFont(null)).toEqual({ fontWeight: '800', letterSpacing: -0.5 });
  });

  it('the configured font falls back until it is loaded', () => {
    expect(brandTitleFont()).toEqual({ fontWeight: '800', letterSpacing: -0.5 });
  });

  it('a configured font that fails to load falls back without throwing', async () => {
    loadAsync.mockRejectedValueOnce(new Error('missing asset'));
    const font = config('Broken-Font');
    await expect(loadBrandFont(font)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(brandTitleFont(font)).toEqual({ fontWeight: '800', letterSpacing: -0.5 });
  });

  it('a slow font does not block startup past the timeout', async () => {
    jest.useFakeTimers();
    loadAsync.mockReturnValueOnce(new Promise(() => undefined));
    const result = loadBrandFont(config('Slow-Font'), 1000);
    jest.advanceTimersByTime(1000);
    await expect(result).resolves.toBe(false);
    jest.useRealTimers();
  });

  it('a loaded font is registered under its family and used by the title', async () => {
    loadAsync.mockResolvedValueOnce(undefined);
    const font = config('Good-Font');
    await expect(loadBrandFont(font)).resolves.toBe(true);
    expect(loadAsync).toHaveBeenCalledWith({ 'Good-Font': 1 });
    isLoaded.mockImplementation((family: string) => family === 'Good-Font');
    expect(brandTitleFont(font)).toEqual({ fontFamily: 'Good-Font', letterSpacing: 0.5 });
    await expect(loadBrandFont(font)).resolves.toBe(true);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });
});

describe('brand font registry', () => {
  it('a loaded font does not count as loaded for another family', async () => {
    loadAsync.mockResolvedValueOnce(undefined);
    await loadBrandFont(config('First-Font'));
    expect(brandTitleFont(config('Other-Font'))).toEqual({
      fontWeight: '800',
      letterSpacing: -0.5,
    });
  });
});
