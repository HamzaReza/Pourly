import { memo, useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useReducedMotionPref, useThemeUi } from './theme';
import { currentToast, dismissToast, subscribeToasts } from './toastQueue';
import { fontSizes, fontWeights, radii, spacing, zIndex } from './tokens';

export { showToast } from './toastQueue';

/** How long one toast stays on screen. */
export const TOAST_MS = 2400;

/**
 * Shows queued toasts one at a time above everything (mounted once in the root layout). Toasts are
 * announced to screen readers and never take touches.
 */
const ToastHostComponent = () => {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const reducedMotion = useReducedMotionPref();
  const insets = useSafeAreaInsets();
  const toast = useSyncExternalStore(subscribeToasts, currentToast);
  const text = toast === null ? '' : t(toast.key, toast.params ?? {});

  useEffect(() => {
    if (toast === null) return;
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, text]);

  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + spacing.xxxl * 2 }]}>
      {toast !== null ? (
        <Animated.View
          key={toast.id}
          entering={reducedMotion ? undefined : FadeInDown.duration(180)}
          exiting={FadeOut.duration(160)}
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: ui.surface, borderColor: ui.textMuted }]}
        >
          <Text style={[styles.text, { color: ui.text }]}>{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

export const ToastHost = memo(ToastHostComponent);

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    start: spacing.lg,
    end: spacing.lg,
    alignItems: 'center',
    zIndex: zIndex.toast,
  },
  toast: {
    maxWidth: 420,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
});
