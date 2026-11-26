import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { I18nManager, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from './IconButton';
import { useActiveTheme } from './theme';
import { MIN_TOUCH_TARGET, spacing, typography } from './tokens';
import { Text } from '@/ui/Text';

export interface ScreenProps {
  /** Header title. Omit together with `showBack={false}` for a header-less screen. */
  title?: string;
  /** Shows a back button that pops the stack, or returns Home when there is nothing to pop. */
  showBack?: boolean;
  /** Content at the header's end (for example the coin badge). */
  headerEnd?: ReactNode;
  /** Scrolls the content (long screens such as Settings). */
  scroll?: boolean;
  /**
   * With `scroll`: the content is at least as tall as the viewport, so a `flex: 1` child can
   * centre itself vertically and still scroll on short screens.
   */
  fill?: boolean;
  children?: ReactNode;
  /** Drawn over the whole screen, outside the padding (overlays and sheets). */
  overlay?: ReactNode;
}

/** Pops the stack, or returns Home when there is nothing to pop. */
export const goBack = (): void => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
};

/** Returns to Home: pops back to it when it is in the stack, otherwise replaces the route. */
export const goHome = (): void => {
  if (router.canDismiss()) {
    router.dismissTo('/');
  } else {
    router.replace('/');
  }
};

/** Themed screen frame: safe-area padding, optional header with back button, status bar style. */
export const Screen = ({
  title,
  showBack = true,
  headerEnd,
  scroll = false,
  fill = false,
  children,
  overlay,
}: ScreenProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useActiveTheme();
  const ui = theme.ui;
  const horizontal = {
    paddingStart: insets.left + spacing.lg,
    paddingEnd: insets.right + spacing.lg,
  };
  return (
    <View style={[styles.root, { backgroundColor: theme.background[0] }]}>
      <StatusBar style={theme.statusBar} />
      <View style={[styles.frame, { paddingTop: insets.top + spacing.sm }]}>
        {title !== undefined || showBack ? (
          <View style={[styles.header, horizontal]}>
            {/* Equal start and end slots keep the title centred whatever the end accessory is. */}
            <View style={[styles.headerSlot, styles.headerStart]}>
              {showBack ? (
                <IconButton
                  icon={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
                  accessibilityLabel={t('common.back')}
                  onPress={goBack}
                  color={ui.text}
                />
              ) : null}
            </View>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: ui.text }]}
            >
              {title}
            </Text>
            <View style={[styles.headerSlot, styles.headerEnd]}>{headerEnd}</View>
          </View>
        ) : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              fill && styles.grow,
              horizontal,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, horizontal, { paddingBottom: insets.bottom + spacing.lg }]}>
            {children}
          </View>
        )}
      </View>
      {overlay}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  frame: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: spacing.sm,
  },
  headerSlot: {
    flex: 1,
    minWidth: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStart: {
    justifyContent: 'flex-start',
  },
  headerEnd: {
    justifyContent: 'flex-end',
  },
  title: {
    flexShrink: 1,
    maxWidth: '60%',
    textAlign: 'center',
    ...typography.screenTitle,
  },
  content: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  grow: {
    flexGrow: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    gap: spacing.xl - spacing.xs,
  },
});
