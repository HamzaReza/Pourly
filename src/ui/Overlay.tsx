import { memo, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
} from 'react-native-reanimated';

import { useReducedMotionPref, useThemeUi } from './theme';
import { colors, fill, fontSizes, fontWeights, radii, spacing, zIndex } from './tokens';

export type OverlayPlacement = 'center' | 'bottom';

export interface OverlayProps {
  title: string;
  /** Optional line under the title. */
  message?: string;
  children?: ReactNode;
  /** Backdrop tap; omit to make the backdrop inert. */
  onBackdropPress?: () => void;
  placement?: OverlayPlacement;
  testID?: string;
}

const ENTER_MS = 180;
const EXIT_MS = 140;

/**
 * Dimmed backdrop plus a themed card, rendered inside the current screen (not a route or a native
 * modal). Mount it conditionally: it animates in and out with Reanimated layout animations (plain
 * fades under reduced motion), never touching board shared values. The card is announced as a
 * modal to screen readers and focus moves to its title.
 */
const OverlayComponent = ({
  title,
  message,
  children,
  onBackdropPress,
  placement = 'center',
  testID,
}: OverlayProps) => {
  const ui = useThemeUi();
  const reducedMotion = useReducedMotionPref();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, []);

  const bottom = placement === 'bottom';
  const cardEntering = reducedMotion
    ? FadeIn.duration(ENTER_MS)
    : bottom
      ? SlideInDown.duration(ENTER_MS + 60)
      : ZoomIn.duration(ENTER_MS).withInitialValues({ transform: [{ scale: 0.92 }] });
  const cardExiting =
    reducedMotion || !bottom ? FadeOut.duration(EXIT_MS) : SlideOutDown.duration(EXIT_MS);

  return (
    <Animated.View
      entering={FadeIn.duration(ENTER_MS)}
      exiting={FadeOut.duration(EXIT_MS)}
      style={[styles.root, bottom ? styles.bottom : styles.center]}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={[fill, styles.backdrop]}
        onPress={onBackdropPress}
        disabled={onBackdropPress === undefined}
        accessible={false}
        importantForAccessibility="no"
      />
      <Animated.View
        entering={cardEntering}
        exiting={cardExiting}
        style={[
          styles.card,
          bottom ? styles.sheetCard : styles.centerCard,
          { backgroundColor: ui.surface },
        ]}
      >
        <Text ref={titleRef} accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
          {title}
        </Text>
        {message !== undefined ? (
          <Text style={[styles.message, { color: ui.textMuted }]}>{message}</Text>
        ) : null}
        <View style={styles.body}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
};

export const Overlay = memo(OverlayComponent);

/** Entering animation for content inside a card that should follow the card in. */
export const overlayContentEntering = (reducedMotion: boolean, delayMs: number) =>
  reducedMotion ? undefined : FadeInDown.delay(delayMs).duration(ENTER_MS);

const styles = StyleSheet.create({
  root: {
    ...fill,
    zIndex: zIndex.overlay,
    paddingHorizontal: spacing.lg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  backdrop: {
    backgroundColor: colors.backdrop,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  centerCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.xl,
  },
  sheetCard: {
    width: '100%',
    borderTopStartRadius: radii.xl,
    borderTopEndRadius: radii.xl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontSize: fontSizes.heading,
    fontWeight: fontWeights.heavy,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSizes.body,
    textAlign: 'center',
  },
  body: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
