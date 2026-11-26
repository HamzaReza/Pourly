import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { ECONOMY } from '@/config/economy';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import type { LevelResult } from '@/state/gameStore';
import { AnimatedCount } from '@/ui/AnimatedCount';
import { Button } from '@/ui/Button';
import { Tag } from '@/ui/Tag';
import { CoinGlyph } from '@/ui/CoinBadge';
import { Overlay } from '@/ui/Overlay';
import { useReducedMotionPref } from '@/ui/theme';
import { colors, fontSizes, fontWeights, spacing, typography } from '@/ui/tokens';
import { Text } from '@/ui/Text';

/** First star lands after the card is in; the others follow at this interval. */
const STAR_DELAY_MS = 220;
const STAR_STEP_MS = 260;
const COIN_COUNT_MS = 900;

export interface WinOverlayProps {
  ui: ThemeUi;
  result: LevelResult;
  onNext: () => void;
  onDouble: () => Promise<boolean>;
  onHome: () => void;
  /** Replay wins: back to the Levels screen (the primary action instead of Next). */
  onLevels?: () => void;
}

/**
 * Win card: stars pop in one after another, the coin reward counts up (UI thread), then Next
 * (primary), Double coins ▶ (DOUBLE_COINS rewarded ad) and Home. A daily win shows "Daily
 * complete", the streak flame and Home as the primary action (no Next, so no interstitial).
 */
const WinOverlayComponent = ({
  ui,
  result,
  onNext,
  onDouble,
  onHome,
  onLevels,
}: WinOverlayProps) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const [busy, setBusy] = useState(false);
  const coins = result.doubled ? result.coins * 2 : result.coins;
  const canDouble = ECONOMY.doubleCoinsOnWin && !result.doubled && result.coins > 0;
  const daily = result.daily;
  const replay = result.replay;

  const double = (): void => {
    setBusy(true);
    onDouble().finally(() => setBusy(false));
  };

  return (
    <Overlay title={t(daily === undefined ? 'win.title' : 'win.dailyTitle')} testID="win-overlay">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('win.starsA11y', { count: result.stars })}
        style={styles.stars}
      >
        {[1, 2, 3].map((index) => {
          const earned = index <= result.stars;
          return (
            <Animated.View
              key={index}
              entering={
                earned && !reducedMotion
                  ? ZoomIn.delay(STAR_DELAY_MS + (index - 1) * STAR_STEP_MS).springify()
                  : undefined
              }
            >
              <Ionicons
                name="star"
                size={index === 2 ? 56 : 44}
                color={earned ? colors.star : colors.starEmpty}
              />
            </Animated.View>
          );
        })}
      </View>
      {daily !== undefined ? (
        <View accessible style={styles.coins}>
          <Ionicons name="flame" size={28} color={colors.flame} />
          <Text style={[styles.streakText, { color: ui.text }]}>
            {t('win.streak', { count: daily.streak, value: formatNumber(daily.streak) })}
          </Text>
        </View>
      ) : null}
      {coins > 0 ? (
        <View
          accessible
          accessibilityLabel={t('win.coinsA11y', { count: coins })}
          style={styles.coins}
        >
          <CoinGlyph size={24} />
          <AnimatedCount
            value={coins}
            from={0}
            prefix="+"
            duration={COIN_COUNT_MS}
            reducedMotion={reducedMotion}
            style={[styles.coinText, { color: ui.text }]}
          />
        </View>
      ) : null}
      {daily !== undefined && !daily.rewarded ? (
        <Text style={[styles.note, { color: ui.textMuted }]}>{t('win.dailyReplay')}</Text>
      ) : null}
      {replay !== undefined && replay.improved ? (
        <View style={styles.tag}>
          <Tag ui={ui} tone="gold" icon="trophy" label={t('win.newBest')} testID="win-new-best" />
        </View>
      ) : null}
      {replay !== undefined && !replay.improved ? (
        <Text style={[styles.note, { color: ui.textMuted }]}>
          {replay.previousStars === 3 ? t('win.perfectAgain') : t('win.replayNote')}
        </Text>
      ) : null}
      {replay !== undefined ? (
        <Button
          variant="primary"
          label={t('win.levels')}
          accessibilityLabel={t('win.levelsA11y')}
          onPress={onLevels ?? onHome}
          ui={ui}
          testID="win-levels"
        />
      ) : daily === undefined ? (
        <Button
          variant="primary"
          label={t('win.next')}
          accessibilityLabel={t('win.nextA11y')}
          onPress={onNext}
          ui={ui}
          testID="win-next"
        />
      ) : (
        <Button
          variant="primary"
          label={t('win.home')}
          onPress={onHome}
          ui={ui}
          testID="win-home"
        />
      )}
      {canDouble ? (
        <Button
          size="md"
          label={t('win.double')}
          accessibilityLabel={t('win.doubleA11y')}
          onPress={double}
          disabled={busy}
          icon="play"
          ui={ui}
        />
      ) : null}
      {daily === undefined ? (
        <Button variant="ghost" label={t('win.home')} onPress={onHome} ui={ui} />
      ) : null}
    </Overlay>
  );
};

export const WinOverlay = memo(WinOverlayComponent);

const styles = StyleSheet.create({
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  coins: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  coinText: {
    minWidth: 56,
    ...typography.stat,
  },
  streakText: {
    fontSize: fontSizes.title - 2,
    fontWeight: fontWeights.bold,
  },
  tag: {
    alignItems: 'center',
    marginTop: spacing.xs,
    /** Room between the "New best!" chip and the action buttons. */
    marginBottom: spacing.md,
  },
  note: {
    ...typography.dialogBody,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
