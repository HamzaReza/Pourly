import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { useSettingsStore } from '@/state/settingsStore';
import { Button } from '@/ui/Button';
import { hairline, ListSeparator, ToggleRow } from '@/ui/List';
import { Sheet } from '@/ui/Sheet';
import { radii, spacing } from '@/ui/tokens';

export interface PauseOverlayProps {
  ui: ThemeUi;
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
}

/** Pause sheet: resume, restart, home, and quick sound/haptics toggles. */
const PauseOverlayComponent = ({ ui, onResume, onRestart, onHome }: PauseOverlayProps) => {
  const { t } = useTranslation();
  const sound = useSettingsStore((state) => state.sound);
  const haptics = useSettingsStore((state) => state.haptics);
  const setSound = useSettingsStore((state) => state.setSound);
  const setHaptics = useSettingsStore((state) => state.setHaptics);

  const onSound = useCallback((value: boolean) => setSound(value), [setSound]);
  const onHaptics = useCallback((value: boolean) => setHaptics(value), [setHaptics]);

  return (
    <Sheet title={t('pause.title')} onClose={onResume} testID="pause-overlay">
      <Button variant="primary" label={t('pause.resume')} onPress={onResume} ui={ui} icon="play" />
      <View style={styles.row}>
        <Button
          size="md"
          label={t('pause.restart')}
          icon="refresh"
          onPress={onRestart}
          ui={ui}
          style={styles.rowItem}
        />
        <Button
          size="md"
          label={t('pause.home')}
          icon="home-outline"
          onPress={onHome}
          ui={ui}
          style={styles.rowItem}
        />
      </View>
      <View style={[styles.toggles, { borderColor: hairline(ui) }]}>
        <ToggleRow
          ui={ui}
          icon={sound ? 'volume-high-outline' : 'volume-mute-outline'}
          label={t('pause.sound')}
          value={sound}
          onChange={onSound}
        />
        <ListSeparator ui={ui} />
        <ToggleRow
          ui={ui}
          icon="phone-portrait-outline"
          label={t('pause.haptics')}
          value={haptics}
          onChange={onHaptics}
        />
      </View>
    </Sheet>
  );
};

export const PauseOverlay = memo(PauseOverlayComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  toggles: {
    marginTop: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
