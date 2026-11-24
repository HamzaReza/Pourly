import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { I18nManager, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from './IconButton';
import { useActiveTheme } from './theme';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, spacing } from './tokens';

export interface ScreenProps {
  /** Header title. Omit together with `showBack={false}` for a header-less screen. */
  title?: string;
  /** Shows a back button that pops the stack, or returns Home when there is nothing to pop. */
  showBack?: boolean;
  /** Content at the header's end (for example the coin badge). */
  headerEnd?: ReactNode;
  /** Scrolls the content (long screens such as Settings). */
  scroll?: boolean;
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
            {showBack ? (
              <IconButton
                icon={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
                accessibilityLabel={t('common.back')}
                onPress={goBack}
                color={ui.text}
              />
            ) : (
              <View style={styles.headerSpacer} />
            )}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: ui.text }]}
            >
              {title}
            </Text>
            {headerEnd ?? <View style={styles.headerSpacer} />}
          </View>
        ) : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
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
  headerSpacer: {
    width: MIN_TOUCH_TARGET,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  content: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
});
