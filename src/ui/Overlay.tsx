import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccessibilityInfo, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
} from 'react-native-reanimated';

import type { IconName } from './IconButton';

import { useReducedMotionPref, useThemeUi, surfaceColors } from './theme';
import { alphas, colors, fill, radii, spacing, typography, withAlpha, zIndex } from './tokens';
import { Text } from '@/ui/Text';

export type OverlayPlacement = 'center' | 'bottom';

/** Tint of the optional icon above the title. */
export type OverlayIconTone = 'accent' | 'gold' | 'danger';

export interface OverlayProps {
  title: string;
  /** Optional line under the title (a string, or spans such as gold stars). */
  message?: ReactNode;
  children?: ReactNode;
  /** Backdrop tap; omit to make the backdrop inert. */
  onBackdropPress?: () => void;
  /**
   * Android Back while this overlay is the top-most one: closes it (defaults to
   * `onBackdropPress`). Without either, Back falls through to the screen's own handling.
   */
  onRequestClose?: () => void;
  placement?: OverlayPlacement;
  /** Optional glyph in a tinted circle above the title. */
  icon?: IconName;
  iconTone?: OverlayIconTone;
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
  onRequestClose,
  placement = 'center',
  icon,
  iconTone = 'accent',
  testID,
}: OverlayProps) => {
  const ui = useThemeUi();
  /** The sheet sits on the screen edge: its padding clears the gesture bar. */
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotionPref();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, []);

  // Back closes only this overlay. BackHandler calls the newest listener first, so the overlay
  // mounted last (the top-most) handles it and the screen underneath never sees it.
  const close = onRequestClose ?? onBackdropPress;
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  const closable = close !== undefined;
  useEffect(() => {
    if (!closable) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current?.();
      return true;
    });
    return () => subscription.remove();
  }, [closable]);

  const bottom = placement === 'bottom';
  /**
   * A text-only (ghost) last action already has empty space under its label, so the card's own
   * bottom padding shrinks to keep the space below the last label equal to the space above the
   * title.
   */
  const actions = Children.toArray(children).filter(isValidElement);
  const lastAction = actions[actions.length - 1] as { props?: { variant?: string } } | undefined;
  const ghostLast = lastAction?.props?.variant === 'ghost';
  const iconColor =
    iconTone === 'gold' ? colors.coin : iconTone === 'danger' ? colors.danger : ui.accent;
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
          !bottom && ghostLast && styles.ghostLast,
          bottom && { paddingBottom: insets.bottom + spacing.xl },
          { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
        ]}
      >
        {bottom ? (
          <View style={[styles.handle, { backgroundColor: withAlpha(ui.textMuted, 0.4) }]} />
        ) : null}
        {icon !== undefined ? (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.icon,
              {
                // Gold on navy turns olive at the usual tint, so gold badges use a lighter one.
                backgroundColor: withAlpha(
                  iconColor,
                  iconTone === 'gold' ? alphas.subtle : alphas.tint,
                ),
              },
            ]}
          >
            <Ionicons name={icon} size={26} color={iconColor} />
          </View>
        ) : null}
        <Text ref={titleRef} accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
          {title}
        </Text>
        {message !== undefined ? (
          <Text textBreakStrategy="balanced" style={[styles.message, { color: ui.textMuted }]}>
            {message}
          </Text>
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
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  centerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.dialog,
    paddingBottom: spacing.xl,
  },
  ghostLast: {
    paddingBottom: spacing.md,
  },
  sheetCard: {
    width: '100%',
    borderTopStartRadius: radii.dialog,
    borderTopEndRadius: radii.dialog,
    borderBottomWidth: 0,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  icon: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.dialogTitle,
  },
  message: {
    ...typography.dialogBody,
  },
  body: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
