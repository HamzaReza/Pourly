import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { canSkip, msUntilTimedSkip } from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { useGameStore } from '@/state/gameStore';
import { CoinBadge } from '@/ui/CoinBadge';
import { IconButton } from '@/ui/IconButton';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

import { Crown } from './Crown';

export interface GameHudProps {
  ui: ThemeUi;
  onPause: () => void;
  /** Long-press on the title (dev FPS overlay); undefined outside `__DEV__`. */
  onTitleLongPress?: () => void;
  onSkip: () => void;
  /** A rewarded ad is on its way; the skip chip waits. */
  skipDisabled: boolean;
}

/** Top bar: pause, "Level N" (crown on hard levels), the skip chip when offered, coins. */
const GameHudComponent = ({
  ui,
  onPause,
  onTitleLongPress,
  onSkip,
  skipDisabled,
}: GameHudProps) => {
  const { t } = useTranslation();
  const levelNumber = useGameStore((state) => state.session?.levelNumber ?? 0);
  const hard = useGameStore((state) => state.session?.hard ?? false);
  const title = t('game.title', { n: levelNumber });

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <IconButton
        icon="pause"
        accessibilityLabel={t('game.pause')}
        onPress={onPause}
        color={ui.text}
      />
      <Pressable
        accessibilityRole="header"
        accessibilityLabel={hard ? t('game.hardTitleA11y', { n: levelNumber }) : title}
        onLongPress={onTitleLongPress}
        style={styles.title}
      >
        {hard ? <Crown /> : null}
        <Text style={[styles.titleText, { color: ui.text }]}>{title}</Text>
      </Pressable>
      <SkipChip ui={ui} onSkip={onSkip} disabled={skipDisabled} />
      <CoinBadge source="game" />
    </View>
  );
};

export const GameHud = memo(GameHudComponent);

export interface SkipChipProps {
  ui: ThemeUi;
  onSkip: () => void;
  disabled: boolean;
}

/**
 * Small "Skip ▶" affordance shown after 3 restarts or 2 minutes on the level (the stuck overlay
 * offers its own). Re-renders when the 2-minute mark passes; the clock is pause-aware.
 */
const SkipChipComponent = ({ ui, onSkip, disabled }: SkipChipProps) => {
  const { t } = useTranslation();
  const live = useGameStore((state) => state.session !== null && state.session.status !== 'won');
  const restarts = useGameStore((state) => state.session?.restartsThisLevel ?? 0);
  const banked = useGameStore((state) => state.session?.elapsedMs ?? 0);
  const runningSince = useGameStore((state) => state.session?.runningSince ?? null);
  const [now, setNow] = useState(() => Date.now());
  const elapsed = banked + (runningSince === null ? 0 : Math.max(0, now - runningSince));
  const offered =
    live && canSkip({ stuck: false, restartsThisLevel: restarts, elapsedMs: elapsed });
  const wait = msUntilTimedSkip(elapsed);

  useEffect(() => {
    if (offered || runningSince === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(wait, 1000) + 50);
    return () => clearTimeout(timer);
  }, [offered, runningSince, wait]);

  if (!offered) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('game.skipA11y')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onSkip}
      style={({ pressed }) => [
        styles.skip,
        { backgroundColor: ui.surface, borderColor: ui.textMuted },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.skipText, { color: ui.text }]}>{t('game.skip')}</Text>
      <Ionicons name="play" size={14} color={ui.text} />
    </Pressable>
  );
};

export const SkipChip = memo(SkipChipComponent);

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  skip: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
  skipText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
  },
});
