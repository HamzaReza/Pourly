import { StyleSheet, View, Pressable } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import { alphas, COMPACT_CONTROL, fontSizes, fontWeights, radii, withAlpha } from './tokens';
import { Text } from '@/ui/Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  ui: ThemeUi;
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Builds each option's accessible label, e.g. "Reduced motion: On". */
  optionA11y: (option: string) => string;
}

/**
 * A compact radio group drawn as one rounded track with the selected segment filled. Segments
 * are 34 dp tall; `hitSlop` keeps each one a 44 dp touch target.
 */
export const SegmentedControl = <T extends string>({
  ui,
  label,
  options,
  value,
  onChange,
  optionA11y,
}: SegmentedControlProps<T>) => (
  <View
    accessibilityRole="radiogroup"
    accessibilityLabel={label}
    style={[styles.track, { backgroundColor: withAlpha(ui.textMuted, alphas.tint) }]}
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={optionA11y(option.label)}
          accessibilityState={{ selected, checked: selected }}
          hitSlop={{ top: 5, bottom: 5 }}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => [
            styles.segment,
            selected && { backgroundColor: ui.accent },
            pressed && !selected && styles.pressed,
          ]}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[
              styles.text,
              selected ? { color: ui.onAccent } : { color: ui.text },
              selected && styles.selectedText,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: COMPACT_CONTROL - 4,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.semibold,
  },
  selectedText: {
    fontWeight: fontWeights.bold,
  },
});
