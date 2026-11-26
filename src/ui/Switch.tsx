import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import { alphas, radii, withAlpha } from './tokens';

export interface SwitchProps {
  ui: ThemeUi;
  value: boolean;
}

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const THUMB = 22;

/**
 * A Material-style switch drawn with views. It is visual only: the row around it owns the press
 * and the `switch` accessibility role, so the whole row is the touch target. The thumb sits at
 * the logical start/end, so it follows RTL.
 */
const SwitchComponent = ({ ui, value }: SwitchProps) => (
  <View
    accessible={false}
    importantForAccessibility="no-hide-descendants"
    style={[
      styles.track,
      value
        ? { backgroundColor: ui.accent, borderColor: ui.accent }
        : { backgroundColor: withAlpha(ui.textMuted, alphas.tint), borderColor: ui.textMuted },
      value ? styles.on : styles.off,
    ]}
  >
    <View
      style={[
        styles.thumb,
        value ? { backgroundColor: ui.onAccent } : { backgroundColor: ui.textMuted },
        !value && styles.thumbOff,
      ]}
    />
  </View>
);

export const Switch = memo(SwitchComponent);

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    paddingHorizontal: 1.5,
    justifyContent: 'center',
  },
  on: {
    alignItems: 'flex-end',
  },
  off: {
    alignItems: 'flex-start',
  },
  thumb: {
    width: THUMB - 3,
    height: THUMB - 3,
    borderRadius: radii.pill,
  },
  thumbOff: {
    width: THUMB - 7,
    height: THUMB - 7,
    marginStart: 2,
  },
});
