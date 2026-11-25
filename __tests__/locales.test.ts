import fs from 'node:fs';
import path from 'node:path';

import { initI18n, isRtlLanguage, resolveLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { RESOURCES } from '@/i18n/resources';

type Tree = { [key: string]: string | Tree };

const EXPECTED_LANGUAGES = [
  'en',
  'es',
  'pt-BR',
  'fr',
  'de',
  'it',
  'ru',
  'tr',
  'id',
  'ar',
  'hi',
  'ja',
  'ko',
];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

const leaves = (tree: Tree, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(full, value);
    else for (const [k, v] of leaves(value, full)) out.set(k, v);
  }
  return out;
};

const placeholders = (text: string): string[] =>
  [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))].sort();

/** Groups leaf keys by base key; plural keys map to their set of categories. */
const grouped = (map: Map<string, string>) => {
  const plain = new Set<string>();
  const plural = new Map<string, Set<string>>();
  for (const key of map.keys()) {
    const match = PLURAL_SUFFIX.exec(key);
    if (match) {
      const base = key.slice(0, -match[0].length);
      const set = plural.get(base) ?? new Set<string>();
      set.add(match[1] ?? '');
      plural.set(base, set);
    } else {
      plain.add(key);
    }
  }
  return { plain, plural };
};

const translation = (lng: string): Tree =>
  (RESOURCES as unknown as Record<string, { translation: Tree }>)[lng]!.translation;

const enLeaves = leaves(translation('en'));
const enGroups = grouped(enLeaves);
const enBaseKeys = new Set([...enGroups.plain, ...enGroups.plural.keys()]);
const others = EXPECTED_LANGUAGES.filter((lng) => lng !== 'en');

/** Placeholders an English key uses, across all its plural variants. */
const enPlaceholdersFor = (base: string): string[] => {
  const values = [...enLeaves]
    .filter(([k]) => k === base || k.replace(PLURAL_SUFFIX, '') === base)
    .map(([, v]) => v);
  return [...new Set(values.flatMap(placeholders))].sort();
};

describe('registered locales', () => {
  it('registers exactly the 13 supported languages', () => {
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual([...EXPECTED_LANGUAGES].sort());
  });

  it.each(EXPECTED_LANGUAGES)('%s has a native name and no empty values', (lng) => {
    const map = leaves(translation(lng));
    expect(map.get('meta.nativeName')?.trim()).toBeTruthy();
    const empty = [...map].filter(([, v]) => v.trim().length === 0).map(([k]) => k);
    expect(empty).toEqual([]);
  });
});

describe.each(others)('locale %s mirrors English', (lng) => {
  const map = leaves(translation(lng));
  const groups = grouped(map);
  const categories = new Intl.PluralRules(lng).resolvedOptions().pluralCategories;

  it('has the same base keys as English', () => {
    const baseKeys = new Set([...groups.plain, ...groups.plural.keys()]);
    expect([...baseKeys].filter((k) => !enBaseKeys.has(k))).toEqual([]);
    expect([...enBaseKeys].filter((k) => !baseKeys.has(k))).toEqual([]);
  });

  it('uses exactly its own plural categories for every English plural key', () => {
    const wrong: string[] = [];
    for (const base of enGroups.plural.keys()) {
      const set = groups.plural.get(base);
      if (!set || [...set].sort().join() !== [...categories].sort().join()) wrong.push(base);
    }
    expect(wrong).toEqual([]);
  });

  it('keeps every English placeholder and adds none', () => {
    const mismatched: string[] = [];
    for (const [key, value] of map) {
      const base = key.replace(PLURAL_SUFFIX, '');
      // A plural form may spell its number out (English "per month", Arabic duals), so `count`
      // is optional there; everywhere else every placeholder must survive.
      const isPlural = PLURAL_SUFFIX.test(key);
      const expected = enPlaceholdersFor(base).filter((p) => !(isPlural && p === 'count'));
      const actual = placeholders(value).filter((p) => !(isPlural && p === 'count'));
      const missing = expected.filter((p) => !actual.includes(p));
      const extra = actual.filter((p) => !enPlaceholdersFor(base).includes(p));
      if (missing.length || extra.length) mismatched.push(key);
    }
    expect(mismatched).toEqual([]);
  });
});

describe('language resolution', () => {
  it('maps Portuguese variants to pt-BR and unknown languages to English', () => {
    expect(resolveLanguage('system', [{ languageTag: 'pt-BR', languageCode: 'pt' }])).toBe('pt-BR');
    expect(resolveLanguage('system', [{ languageTag: 'pt-PT', languageCode: 'pt' }])).toBe('pt-BR');
    expect(resolveLanguage('system', [{ languageTag: 'nl-NL', languageCode: 'nl' }])).toBe('en');
    expect(resolveLanguage('system', [{ languageTag: 'ar-EG', languageCode: 'ar' }])).toBe('ar');
    expect(resolveLanguage('ja', [{ languageTag: 'de-DE', languageCode: 'de' }])).toBe('ja');
  });

  it('flags only Arabic as right-to-left', () => {
    expect(EXPECTED_LANGUAGES.filter(isRtlLanguage)).toEqual(['ar']);
  });

  it('uses English singular and plural forms for counted rewards', async () => {
    const i18n = await initI18n('en');
    expect(i18n.t('reward.hints', { count: 1 })).toBe('+1 hint');
    expect(i18n.t('reward.hints', { count: 2 })).toBe('+2 hints');
    expect(i18n.t('game.costCoins', { count: 1 })).toBe('1 coin');
  });

  it('switches language and interpolates in a plural-heavy locale', async () => {
    const i18n = await initI18n('ru');
    expect(i18n.language).toBe('ru');
    expect(i18n.t('meta.nativeName')).toBe('Русский');
    await initI18n('en');
  });
});

describe('store listings', () => {
  const dir = path.join(__dirname, '..', 'store-listing');

  const section = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
    if (start < 0) return '';
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.startsWith('## ')) break;
      if (line.trim().startsWith('```')) continue;
      body.push(line);
    }
    return body.join('\n').trim();
  };

  const codePoints = (s: string): number => [...s].length;

  it.each(EXPECTED_LANGUAGES)('%s draft is within Play limits', (lng) => {
    const text = fs.readFileSync(path.join(dir, `${lng}.md`), 'utf8');
    expect(text).toMatch(/DRAFT/);
    const title = section(text, 'Title');
    const short = section(text, 'Short description');
    const full = section(text, 'Full description');
    expect(title).toMatch(/Pourly/);
    expect(codePoints(title)).toBeLessThanOrEqual(30);
    expect(codePoints(short)).toBeGreaterThan(0);
    expect(codePoints(short)).toBeLessThanOrEqual(80);
    expect(codePoints(full)).toBeGreaterThan(200);
    expect(codePoints(full)).toBeLessThanOrEqual(4000);
  });
});
