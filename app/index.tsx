import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { colors, fontSizes, fontWeights, spacing } from '@/ui/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();
  const level = useProgressStore((state) => state.level);

  return (
    <Screen showBack={false}>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('app.name')}
        </Text>
        <Button
          variant="primary"
          label={t('home.play', { n: level })}
          accessibilityLabel={t('home.playA11y', { n: level })}
          onPress={() =>
            router.push({ pathname: '/game', params: { mode: 'level', level: String(level) } })
          }
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
