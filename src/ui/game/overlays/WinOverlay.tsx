import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { ECONOMY } from '@/config/economy';
import type { ThemeUi } from '@/render/themes';
import type { LevelResult } from '@/state/gameStore';
import { AnimatedCount } from '@/ui/AnimatedCount';
import { Button } from '@/ui/Button';
import { CoinGlyph } from '@/ui/CoinBadge';
import { Overlay } from '@/ui/Overlay';
import { useReducedMotionPref } from '@/ui/theme';
import { colors, fontSizes, fontWeights, spacing } from '@/ui/tokens';

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
}

/**
 * Win card: stars pop in one after another, the coin reward counts up (UI thread), then Next
 * (primary), Double coins ▶ (DOUBLE_COINS rewarded ad) and Home.
 */
const WinOverlayComponent = ({ ui, result, onNext, onDouble, onHome }: WinOverlayProps) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const [busy, setBusy] = useState(false);
  const coins = result.doubled ? result.coins * 2 : result.coins;
  const canDouble = ECONOMY.doubleCoinsOnWin && !result.doubled && result.coins > 0;

  const double = (): void => {
    setBusy(true);
    onDouble().finally(() => setBusy(false));
  };

  return (
    <Overlay title={t('win.title')} testID="win-overlay">
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
      <Button
        variant="primary"
        label={t('win.next')}
        accessibilityLabel={t('win.nextA11y')}
        onPress={onNext}
        ui={ui}
        testID="win-next"
      />
      {canDouble ? (
        <Button
          label={t('win.double')}
          accessibilityLabel={t('win.doubleA11y')}
          onPress={double}
          disabled={busy}
          icon="play"
          ui={ui}
        />
      ) : null}
      <Button label={t('win.home')} onPress={onHome} ui={ui} />
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
    fontSize: fontSizes.heading,
    fontWeight: fontWeights.heavy,
  },
});
