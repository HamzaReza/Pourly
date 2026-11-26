/**
 * Grouped lists for every screen (Settings, Shop, …): a small uppercase section label, a rounded
 * card whose rows are split by inset hairlines, and the rows that go in it. Every row has a
 * tinted leading icon tile, a title with an optional muted hint, and a trailing control.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, Fragment, memo, type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import type { IconName } from './IconButton';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';
import { Switch } from './Switch';
import { surfaceColors } from './theme';
import {
  alphas,
  colors,
  fontSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
  withAlpha,
} from './tokens';
import { Text } from '@/ui/Text';

/** Width of the leading icon tile; separators are inset past it. */
export const ICON_TILE = 30;
/** Horizontal padding of every row. */
export const ROW_PADDING = spacing.lg;
const SEPARATOR_INSET = ROW_PADDING + ICON_TILE + spacing.md;

/** Hairline color for separators and card outlines. */
export const hairline = (ui: ThemeUi): string => surfaceColors(ui).hairline;

export interface SectionTitleProps {
  ui: ThemeUi;
  title: string;
}

/** Small uppercase header above a group of rows or cards. */
export const SectionTitle = memo(({ ui, title }: SectionTitleProps) => (
  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: ui.textMuted }]}>
    {title}
  </Text>
));
SectionTitle.displayName = 'SectionTitle';

/** The inset hairline between two rows. */
export const ListSeparator = memo(({ ui }: { ui: ThemeUi }) => (
  <View style={[styles.separator, { backgroundColor: hairline(ui) }]} />
));
ListSeparator.displayName = 'ListSeparator';

export interface ListSectionProps {
  ui: ThemeUi;
  title: string;
  /** Muted note under the card. */
  footer?: string;
  children: ReactNode;
}

/** A titled group of rows on one rounded card, split by inset hairlines. */
export const ListSection = memo(({ ui, title, footer, children }: ListSectionProps) => {
  const rows = Children.toArray(children);
  const line = hairline(ui);
  return (
    <View style={styles.section}>
      <SectionTitle ui={ui} title={title} />
      <View style={[styles.sectionBody, { backgroundColor: ui.surface, borderColor: line }]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <ListSeparator ui={ui} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer !== undefined ? (
        <Text style={[styles.sectionFooter, { color: ui.textMuted }]}>{footer}</Text>
      ) : null}
    </View>
  );
});
ListSection.displayName = 'ListSection';

export type RowTone = 'default' | 'danger';

export interface RowIconProps {
  ui: ThemeUi;
  icon: IconName;
  tone?: RowTone;
}

/** The tinted rounded tile at a row's start. */
export const RowIcon = memo(({ ui, icon, tone = 'default' }: RowIconProps) => {
  const color = tone === 'danger' ? colors.danger : ui.accent;
  return (
    <View style={[styles.iconTile, { backgroundColor: withAlpha(color, alphas.tint) }]}>
      <Ionicons name={icon} size={17} color={color} />
    </View>
  );
});
RowIcon.displayName = 'RowIcon';

const RowTexts = ({ ui, label, hint }: { ui: ThemeUi; label: string; hint?: string }) => (
  <View style={styles.texts}>
    <Text style={[styles.label, { color: ui.text }]}>{label}</Text>
    {hint !== undefined ? <Text style={[styles.hint, { color: ui.textMuted }]}>{hint}</Text> : null}
  </View>
);

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
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: surfaceColors(ui).pressed },
      ]}
      testID={testID}
    >
      <RowIcon ui={ui} icon={icon} />
      <RowTexts ui={ui} label={label} hint={hint} />
      <Switch ui={ui} value={value} />
    </Pressable>
  ),
);
ToggleRow.displayName = 'ToggleRow';

export type ChoiceOption<T extends string> = SegmentOption<T>;

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

/** A label with a compact segmented control under it. */
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
      <RowIcon ui={ui} icon={icon} />
      <RowTexts ui={ui} label={label} hint={hint} />
    </View>
    <View style={styles.choiceControl}>
      <SegmentedControl
        ui={ui}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        optionA11y={optionA11y}
      />
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
  /** `danger` tints the icon for destructive actions. */
  tone?: RowTone;
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
    tone,
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
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: surfaceColors(ui).pressed },
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      <RowIcon ui={ui} icon={icon} tone={tone} />
      <RowTexts ui={ui} label={label} hint={hint} />
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
        size={external === true ? 16 : 18}
        color={ui.textMuted}
      />
    </Pressable>
  ),
);
LinkRow.displayName = 'LinkRow';

export interface InfoRowProps {
  ui: ThemeUi;
  text: string;
  /** Optional muted glyph before the text. */
  icon?: IconName;
}

/** Plain muted text inside a section (notes). */
export const InfoRow = memo(({ ui, text, icon }: InfoRowProps) => (
  <View style={styles.info}>
    {icon !== undefined ? <Ionicons name={icon} size={16} color={ui.textMuted} /> : null}
    <Text style={[styles.infoText, { color: ui.textMuted }]}>{text}</Text>
  </View>
));
InfoRow.displayName = 'InfoRow';

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.sectionLabel,
    paddingHorizontal: spacing.xs,
  },
  sectionBody: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionFooter: {
    ...typography.fine,
    paddingHorizontal: spacing.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginStart: SEPARATOR_INSET,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.md,
  },
  disabled: {
    opacity: 0.55,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radii.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xxs,
    /** With the row gap, keeps wrapped text ≥ 16 dp from the trailing switch or chevron. */
    paddingEnd: spacing.xs,
  },
  label: {
    ...typography.rowTitle,
  },
  hint: {
    ...typography.rowHint,
  },
  value: {
    maxWidth: '40%',
    fontSize: fontSizes.small,
  },
  choice: {
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  choiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  choiceControl: {
    paddingStart: ICON_TILE + spacing.md,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.md,
  },
  infoText: {
    flex: 1,
    ...typography.rowHint,
  },
});
