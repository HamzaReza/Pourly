import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import type { IconName } from './IconButton';
import { colors, radii, spacing, typography } from './tokens';
import { Text } from '@/ui/Text';

/** `accent`: theme accent fill. `gold`: coin gold fill (value offers, VIP). */
export type TagTone = 'accent' | 'gold';

export interface TagProps {
  ui: ThemeUi;
  label: string;
  tone?: TagTone;
  icon?: IconName;
  /** Screen-reader label; the tag is read as plain text when omitted. */
  accessibilityLabel?: string;
  testID?: string;
}

/** A small uppercase ribbon ("One-time offer", "Popular", "Active"). */
const TagComponent = ({
  ui,
  label,
  tone = 'accent',
  icon,
  accessibilityLabel,
  testID,
}: TagProps) => {
  const background = tone === 'gold' ? colors.coin : ui.accent;
  const foreground = tone === 'gold' ? colors.onAccent : ui.onAccent;
  return (
    <View
      style={[styles.tag, { backgroundColor: background }]}
      accessible={accessibilityLabel !== undefined ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {icon !== undefined ? <Ionicons name={icon} size={11} color={foreground} /> : null}
      <Text numberOfLines={1} style={[styles.text, { color: foreground }]}>
        {label}
      </Text>
    </View>
  );
};

export const Tag = memo(TagComponent);

const styles = StyleSheet.create({
  tag: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  text: {
    ...typography.tag,
    flexShrink: 1,
  },
});
