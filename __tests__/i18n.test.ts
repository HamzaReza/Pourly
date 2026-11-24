import { initI18n, isRtlLanguage, resolveLanguage } from '@/i18n';

describe('resolveLanguage', () => {
  it('falls back to English for unsupported device locales', () => {
    expect(resolveLanguage('system', [{ languageTag: 'xx-YY', languageCode: 'xx' }])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });

  it('matches by base language and honours a supported override', () => {
    expect(resolveLanguage('system', [{ languageTag: 'en-GB', languageCode: 'en' }])).toBe('en');
    expect(resolveLanguage('EN', [])).toBe('en');
  });
});

describe('initI18n', () => {
  it('loads English and interpolates {{n}}', async () => {
    const i18n = await initI18n('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('home.play', { n: 12 })).toBe('Level 12');
  });
});

describe('isRtlLanguage', () => {
  it('flags Arabic only', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });
});
