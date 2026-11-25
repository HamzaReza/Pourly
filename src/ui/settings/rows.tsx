/**
 * Building blocks of the Settings screen (also used for the Shop's sections). Each phase adds its
 * own `SettingsSection` (Purchases and Ad privacy in phase 7, Notifications in phase 8, Account
 * later) built from these rows.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';
import type { IconName } from '@/ui/IconButton';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

export interface SettingsSectionProps {
  ui: ThemeUi;
  title: string;
  children: ReactNode;
}

/** A titled group of rows on one surface. */
export const SettingsSection = memo(({ ui, title, children }: SettingsSectionProps) => (
  <View style={styles.section}>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: ui.textMuted }]}>
      {title}
    </Text>
    <View style={[styles.sectionBody, { backgroundColor: ui.surface }]}>{children}</View>
  </View>
));
SettingsSection.displayName = 'SettingsSection';

export interface ToggleRowProps {
  ui: ThemeUi;
  icon: IconName;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}

/** A whole-row switch. */
export const ToggleRow = memo(
  ({ ui, icon, label, hint, value, onChange, testID }: ToggleRowProps) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Ionicons name={icon} size={22} color={ui.text} />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: ui.text }]}>{label}</Text>
        {hint !== undefined ? (
          <Text style={[styles.hint, { color: ui.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
      <Ionicons
        name={value ? 'toggle' : 'toggle-outline'}
        size={34}
        color={value ? ui.accent : ui.textMuted}
      />
    </Pressable>
  ),
);
ToggleRow.displayName = 'ToggleRow';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceRowProps<T extends string> {
  ui: ThemeUi;
  icon: IconName;
  label: string;
  hint?: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Builds each option's accessible label, e.g. "Reduced motion: On". */
  optionA11y: (option: string) => string;
}

/** A label with a segmented radio group under it. */
export const ChoiceRow = <T extends string>({
  ui,
  icon,
  label,
  hint,
  options,
  value,
  onChange,
  optionA11y,
}: ChoiceRowProps<T>) => (
  <View style={styles.choice}>
    <View style={styles.choiceHeader}>
      <Ionicons name={icon} size={22} color={ui.text} />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: ui.text }]}>{label}</Text>
        {hint !== undefined ? (
          <Text style={[styles.hint, { color: ui.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segments}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={optionA11y(option.label)}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              { borderColor: selected ? ui.accent : ui.textMuted },
              selected && { backgroundColor: ui.accent },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.segmentText, { color: selected ? ui.onAccent : ui.text }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

export interface LinkRowProps {
  ui: ThemeUi;
  icon: IconName;
  label: string;
  /** Text at the row's end (for example the current language). */
  value?: string;
  hint?: string;
  accessibilityLabel?: string;
  /** Opens something outside the app (shows an external-link glyph instead of a chevron). */
  external?: boolean;
  /** Ignores presses while an action it started is still running. */
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A row that navigates, opens a sheet or a link. */
export const LinkRow = memo(
  ({
    ui,
    icon,
    label,
    value,
    hint,
    accessibilityLabel,
    external,
    disabled = false,
    onPress,
    testID,
  }: LinkRowProps) => (
    <Pressable
      accessibilityRole={external === true ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, (pressed || disabled) && styles.pressed]}
      testID={testID}
    >
      <Ionicons name={icon} size={22} color={ui.text} />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: ui.text }]}>{label}</Text>
        {hint !== undefined ? (
          <Text style={[styles.hint, { color: ui.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text style={[styles.value, { color: ui.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons
        name={
          external === true
            ? 'open-outline'
            : I18nManager.isRTL
              ? 'chevron-back'
              : 'chevron-forward'
        }
        size={18}
        color={ui.textMuted}
      />
    </Pressable>
  ),
);
LinkRow.displayName = 'LinkRow';

export interface InfoRowProps {
  ui: ThemeUi;
  text: string;
}

/** Plain text inside a section (version line, notes). */
export const InfoRow = memo(({ ui, text }: InfoRowProps) => (
  <View style={styles.info}>
    <Text style={[styles.hint, { color: ui.textMuted }]}>{text}</Text>
  </View>
));
InfoRow.displayName = 'InfoRow';

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
    paddingHorizontal: spacing.sm,
  },
  sectionBody: {
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flex: 1,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  hint: {
    fontSize: fontSizes.small,
  },
  value: {
    maxWidth: '40%',
    fontSize: fontSizes.small,
  },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  choiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
  },
  info: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
