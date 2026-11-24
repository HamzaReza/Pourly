import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from './IconButton';
import { colors, fontSizes, fontWeights, MIN_TOUCH_TARGET, spacing } from './tokens';

export interface ScreenProps {
  /** Header title. Omit together with `showBack={false}` for a header-less screen. */
  title?: string;
  /** Shows a back button that pops the stack, or returns Home when there is nothing to pop. */
  showBack?: boolean;
  children?: ReactNode;
}

/** Pops the stack, or returns Home when there is nothing to pop. */
export const goBack = (): void => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
};

export const Screen = ({ title, showBack = true, children }: ScreenProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.lg,
          paddingStart: insets.left + spacing.lg,
          paddingEnd: insets.right + spacing.lg,
        },
      ]}
    >
      {title !== undefined || showBack ? (
        <View style={styles.header}>
          {showBack ? (
            <IconButton
              icon={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
              accessibilityLabel={t('common.back')}
              onPress={goBack}
            />
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  headerSpacer: {
    width: MIN_TOUCH_TARGET,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  content: {
    flex: 1,
    paddingTop: spacing.xl,
  },
});
