import { act, render, screen } from '@testing-library/react-native';
import * as Font from 'expo-font';
import { StyleSheet } from 'react-native';

import {
  loadUiFonts,
  normalizeWeight,
  setUiFontLanguage,
  setUiFontsLoaded,
  uiFontActive,
  uiFontFamily,
  usesUiFont,
  withUiFont,
  UI_FONT_FAMILIES,
} from '@/ui/fonts';
import { Text } from '@/ui/Text';
import { logger } from '@/utils/logger';

jest.mock('expo-font', () => ({ loadAsync: jest.fn(), isLoaded: jest.fn(() => false) }));

const loadAsync = Font.loadAsync as jest.Mock;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  setUiFontsLoaded(true);
  setUiFontLanguage('en');
});

describe('weight → family mapping', () => {
  it('maps every design-system weight to its own DM Sans family', () => {
    expect(uiFontFamily('400')).toBe('DMSans_400Regular');
    expect(uiFontFamily('500')).toBe('DMSans_500Medium');
    expect(uiFontFamily('600')).toBe('DMSans_600SemiBold');
    expect(uiFontFamily('700')).toBe('DMSans_700Bold');
    expect(uiFontFamily('800')).toBe('DMSans_800ExtraBold');
    expect(Object.keys(UI_FONT_FAMILIES)).toEqual(['400', '500', '600', '700', '800']);
  });

  it('normalizes other weight forms to the nearest provided weight', () => {
    expect(normalizeWeight(undefined)).toBe('400');
    expect(normalizeWeight('normal')).toBe('400');
    expect(normalizeWeight('bold')).toBe('700');
    expect(normalizeWeight(900)).toBe('800');
    expect(normalizeWeight('300')).toBe('400');
    expect(normalizeWeight(600)).toBe('600');
  });

  it('withUiFont swaps the weight for the family and keeps an explicit family', () => {
    expect(withUiFont({ fontSize: 16, fontWeight: '700' }, true)).toEqual({
      fontSize: 16,
      fontFamily: 'DMSans_700Bold',
    });
    expect(withUiFont({ fontFamily: 'Brand', fontWeight: '800' }, true)).toEqual({
      fontFamily: 'Brand',
      fontWeight: '800',
    });
    const style = { fontWeight: '700' as const };
    expect(withUiFont(style, false)).toBe(style);
  });
});

describe('script coverage', () => {
  it('uses DM Sans for Latin-script languages and the system font for the others', () => {
    for (const lng of ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'tr', 'id']) {
      expect(usesUiFont(lng)).toBe(true);
    }
    for (const lng of ['ru', 'ar', 'hi', 'ja', 'ko']) expect(usesUiFont(lng)).toBe(false);
  });

  it('the UI font is active only once loaded and for a Latin language', () => {
    expect(uiFontActive()).toBe(true);
    setUiFontLanguage('ja');
    expect(uiFontActive()).toBe(false);
    setUiFontLanguage('de');
    setUiFontsLoaded(false);
    expect(uiFontActive()).toBe(false);
  });
});

describe('Text', () => {
  it('draws with the DM Sans family for its weight', async () => {
    await render(<Text style={{ fontSize: 16, fontWeight: '600' }}>Hello</Text>);
    const style = flat(screen.getByText('Hello').props.style);
    expect(style).toMatchObject({ fontSize: 16, fontFamily: 'DMSans_600SemiBold' });
    expect(style.fontWeight).toBeUndefined();
  });

  it('switches to the system font when the language changes to a non-Latin script, and back', async () => {
    await render(<Text style={{ fontWeight: '700' }}>Hello</Text>);
    await act(() => setUiFontLanguage('ru'));
    let style = flat(screen.getByText('Hello').props.style);
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe('700');
    await act(() => setUiFontLanguage('fr'));
    style = flat(screen.getByText('Hello').props.style);
    expect(style.fontFamily).toBe('DMSans_700Bold');
  });

  it('a nested span inherits the parent family unless it sets a weight', async () => {
    await render(
      <Text style={{ fontWeight: '800' }}>
        Pour
        <Text style={{ color: 'red' }}>ly</Text>
        <Text style={{ fontWeight: '400' }}>!</Text>
      </Text>,
    );
    expect(flat(screen.getByText('ly').props.style).fontFamily).toBeUndefined();
    expect(flat(screen.getByText('!').props.style).fontFamily).toBe('DMSans_400Regular');
  });

  it('a plain Text gets the regular family', async () => {
    await render(<Text>Plain</Text>);
    expect(flat(screen.getByText('Plain').props.style).fontFamily).toBe('DMSans_400Regular');
  });
});

describe('loadUiFonts', () => {
  it('registers every weight and activates the UI font', async () => {
    setUiFontsLoaded(false);
    loadAsync.mockResolvedValueOnce(undefined);
    await expect(loadUiFonts()).resolves.toBe(true);
    expect(Object.keys(loadAsync.mock.calls[0][0] as object).sort()).toEqual(
      Object.values(UI_FONT_FAMILIES).sort(),
    );
    expect(uiFontActive()).toBe(true);
  });

  it('a failed load keeps the system font and never throws', async () => {
    setUiFontsLoaded(false);
    loadAsync.mockRejectedValueOnce(new Error('no asset'));
    await expect(loadUiFonts()).resolves.toBe(false);
    expect(uiFontActive()).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('a slow load gives up at the timeout', async () => {
    jest.useFakeTimers();
    setUiFontsLoaded(false);
    loadAsync.mockReturnValueOnce(new Promise(() => undefined));
    const result = loadUiFonts(500);
    jest.advanceTimersByTime(500);
    await expect(result).resolves.toBe(false);
    jest.useRealTimers();
  });
});
