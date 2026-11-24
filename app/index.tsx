import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { prepareLevel } from '@/state/levelLoader';
import { isResumable, useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { consumeAutoStart, shouldAutoStart } from '@/state/startup';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { revealApp } from '@/ui/splash';
import { colors, fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

const openGame = (): void => {
  router.push({ pathname: '/game', params: { mode: 'level' } });
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const level = useProgressStore((state) => state.level);
  const canResume = useGameStore((state) => isResumable(state.session, level));
  const [autoStart] = useState(shouldAutoStart);

  useEffect(() => {
    if (autoStart) {
      consumeAutoStart();
      return;
    }
    revealApp();
  }, [autoStart]);

  // Get the level Play opens ready while Home is idle (instant for levels 1–300).
  useEffect(() => {
    if (!autoStart && !canResume) void prepareLevel(level);
  }, [autoStart, canResume, level]);

  if (autoStart) return <Redirect href={{ pathname: '/game', params: { mode: 'level' } }} />;

  return (
    <Screen showBack={false}>
      {canResume ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.resumeA11y', { n: level })}
          onPress={openGame}
          style={({ pressed }) => [styles.resume, pressed && styles.pressed]}
        >
          <Ionicons name="play-circle" size={28} color={colors.accent} />
          <Text style={styles.resumeText}>{t('home.resume', { n: level })}</Text>
          <Ionicons
            name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      ) : null}
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('app.name')}
        </Text>
        <Button
          variant="primary"
          label={t('home.play', { n: level })}
          accessibilityLabel={t('home.playA11y', { n: level })}
          onPress={openGame}
          style={styles.play}
        />
      </View>
      <View style={styles.row}>
        <Button
          label={t('home.daily')}
          onPress={() => router.push('/daily')}
          style={styles.rowItem}
        />
        <Button
          label={t('home.shop')}
          onPress={() => router.push('/shop')}
          style={styles.rowItem}
        />
      </View>
      <View style={styles.row}>
        <Button
          label={t('home.themes')}
          onPress={() => router.push('/themes')}
          style={styles.rowItem}
        />
        <Button
          label={t('home.settings')}
          onPress={() => router.push('/settings')}
          style={styles.rowItem}
        />
      </View>
      {__DEV__ ? (
        <Button
          label="Dev: stress test"
          onPress={() => router.push('/dev-stress')}
          style={styles.devButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resume: {
    minHeight: MIN_TOUCH_TARGET + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  resumeText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.display,
    fontWeight: fontWeights.heavy,
  },
  play: {
    minWidth: 220,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  devButton: {
    marginTop: spacing.md,
  },
});
