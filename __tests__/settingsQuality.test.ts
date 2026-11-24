import { migrateSettings } from '@/state/migrations';
import {
  DEFAULT_SETTINGS,
  effectiveQuality,
  SETTINGS_VERSION,
  useSettingsStore,
} from '@/state/settingsStore';

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});

describe('effectiveQuality', () => {
  it('follows an explicit choice and resolves auto from the monitor flag', () => {
    expect(effectiveQuality('high', false)).toBe('high');
    expect(effectiveQuality('high', true)).toBe('high');
    expect(effectiveQuality('low', false)).toBe('low');
    expect(effectiveQuality('low', true)).toBe('low');
    expect(effectiveQuality('auto', false)).toBe('high');
    expect(effectiveQuality('auto', true)).toBe('low');
  });
});

describe('autoQualityDowngraded', () => {
  it('migrates to false when missing and keeps a stored value', () => {
    expect(SETTINGS_VERSION).toBe(2);
    expect(DEFAULT_SETTINGS.autoQualityDowngraded).toBe(false);
    expect(migrateSettings({ quality: 'auto' }).autoQualityDowngraded).toBe(false);
    expect(migrateSettings({ autoQualityDowngraded: true }).autoQualityDowngraded).toBe(true);
    expect(migrateSettings({ autoQualityDowngraded: 'yes' }).autoQualityDowngraded).toBe(false);
  });

  it('is set by the monitor only while quality is auto', () => {
    useSettingsStore.getState().markAutoQualityDowngraded();
    expect(useSettingsStore.getState().autoQualityDowngraded).toBe(true);

    useSettingsStore.setState({ quality: 'high', autoQualityDowngraded: false });
    useSettingsStore.getState().markAutoQualityDowngraded();
    expect(useSettingsStore.getState().autoQualityDowngraded).toBe(false);
  });

  it('is cleared by any explicit quality choice', () => {
    useSettingsStore.getState().markAutoQualityDowngraded();
    useSettingsStore.getState().setQuality('auto');
    expect(useSettingsStore.getState().autoQualityDowngraded).toBe(false);
    useSettingsStore.setState({ autoQualityDowngraded: true });
    useSettingsStore.getState().setQuality('low');
    expect(useSettingsStore.getState()).toMatchObject({
      quality: 'low',
      autoQualityDowngraded: false,
    });
  });
});
