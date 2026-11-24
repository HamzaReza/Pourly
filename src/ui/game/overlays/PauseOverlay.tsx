import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { useSettingsStore } from '@/state/settingsStore';
import { Button } from '@/ui/Button';
import type { IconName } from '@/ui/IconButton';
import { Sheet } from '@/ui/Sheet';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

export interface PauseOverlayProps {
  ui: ThemeUi;
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
}

interface ToggleRowProps {
  icon: IconName;
  label: string;
  value: boolean;
  onToggle: () => void;
  ui: ThemeUi;
}

const ToggleRow = memo(({ icon, label, value, onToggle, ui }: ToggleRowProps) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityState={{ checked: value }}
    onPress={onToggle}
    style={({ pressed }) => [
      styles.toggle,
      { borderColor: ui.textMuted },
      pressed && styles.pressed,
    ]}
  >
    <Ionicons name={icon} size={22} color={ui.text} />
    <Text style={[styles.toggleLabel, { color: ui.text }]}>{label}</Text>
    <Ionicons
      name={value ? 'toggle' : 'toggle-outline'}
      size={30}
      color={value ? ui.accent : ui.textMuted}
    />
  </Pressable>
));
ToggleRow.displayName = 'ToggleRow';

/** Pause sheet: resume, restart, home, and quick sound/haptics toggles. */
const PauseOverlayComponent = ({ ui, onResume, onRestart, onHome }: PauseOverlayProps) => {
  const { t } = useTranslation();
  const sound = useSettingsStore((state) => state.sound);
  const haptics = useSettingsStore((state) => state.haptics);
  const setSound = useSettingsStore((state) => state.setSound);
  const setHaptics = useSettingsStore((state) => state.setHaptics);

  return (
    <Sheet title={t('pause.title')} onClose={onResume} testID="pause-overlay">
      <Button variant="primary" label={t('pause.resume')} onPress={onResume} ui={ui} icon="play" />
      <View style={styles.row}>
        <Button label={t('pause.restart')} onPress={onRestart} ui={ui} style={styles.rowItem} />
        <Button label={t('pause.home')} onPress={onHome} ui={ui} style={styles.rowItem} />
      </View>
      <View style={styles.row}>
        <ToggleRow
          icon={sound ? 'volume-high' : 'volume-mute'}
          label={t('pause.sound')}
          value={sound}
          onToggle={() => setSound(!sound)}
          ui={ui}
        />
        <ToggleRow
          icon="phone-portrait"
          label={t('pause.haptics')}
          value={haptics}
          onToggle={() => setHaptics(!haptics)}
          ui={ui}
        />
      </View>
    </Sheet>
  );
};

export const PauseOverlay = memo(PauseOverlayComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  toggle: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  pressed: {
    opacity: 0.8,
  },
});
