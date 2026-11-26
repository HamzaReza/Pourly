import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';

import { dailyDateOf } from '@/game/daily';
import { canSkip, msUntilTimedSkip } from '@/game/economy';
import { formatDate } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useGameStore } from '@/state/gameStore';
import { CoinBadge } from '@/ui/CoinBadge';
import { IconButton } from '@/ui/IconButton';
import { VipBadge } from '@/ui/VipBadge';
import { surfaceColors } from '@/ui/theme';
import {
  controlHeights,
  fill,
  fontSizes,
  fontWeights,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
} from '@/ui/tokens';
import { parseLocalDate } from '@/utils/date';

import { Crown } from './Crown';
import { Text } from '@/ui/Text';

export interface GameHudProps {
  ui: ThemeUi;
  onPause: () => void;
  /** Long-press on the title (dev FPS overlay); undefined outside `__DEV__`. */
  onTitleLongPress?: () => void;
  onSkip: () => void;
  /** A rewarded ad is on its way; the skip chip waits. */
  skipDisabled: boolean;
}

/**
 * Top bar: pause, "Level N" (crown on hard levels) or "Daily · date", the skip chip when offered
 * (level mode only), coins.
 */
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
  const [sides, setSides] = useState({ start: 0, end: 0 });
  const replay = useGameStore((state) => state.session?.mode === 'replay');
  const dailyDate = useGameStore((state) =>
    state.session?.mode === 'daily' ? dailyDateOf(state.session.levelId) : null,
  );
  const day = dailyDate === null ? null : parseLocalDate(dailyDate);
  const dayLabel = day === null ? '' : formatDate(day, { month: 'short', day: 'numeric' });
  const title =
    day !== null
      ? t('game.dailyTitle', { date: dayLabel })
      : replay
        ? t('game.replayTitle', { n: levelNumber })
        : levelNumber > 0
          ? t('game.title', { n: levelNumber })
          : // No session (a locked chapter's gate is up): no title.
            '';
  const titleA11y =
    day !== null
      ? t('game.dailyTitleA11y', { date: formatDate(day, { month: 'long', day: 'numeric' }) })
      : hard
        ? replay
          ? `${title}, ${t('levels.hardA11y')}`
          : t('game.hardTitleA11y', { n: levelNumber })
        : title;

  /** The title is centred on the full bar, inset by the wider of the two side groups. */
  const inset = Math.max(sides.start, sides.end) + spacing.sm;
  const measure = (side: 'start' | 'end') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setSides((previous) => (previous[side] === width ? previous : { ...previous, [side]: width }));
  };

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <View
        pointerEvents="box-none"
        style={[styles.titleLayer, { paddingStart: inset, paddingEnd: inset }]}
      >
        <Pressable
          accessibilityRole="header"
          accessibilityLabel={titleA11y}
          onLongPress={onTitleLongPress}
          style={styles.title}
          testID="game-title"
        >
          {hard && day === null ? <Crown /> : null}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.titleText, { color: ui.text }]}
          >
            {title}
          </Text>
        </Pressable>
      </View>
      <View onLayout={measure('start')} style={styles.side} testID="hud-start">
        <IconButton
          icon="pause"
          accessibilityLabel={t('game.pause')}
          onPress={onPause}
          color={ui.text}
          tone="filled"
          ui={ui}
        />
      </View>
      <View style={styles.spacer} pointerEvents="none" />
      <View onLayout={measure('end')} style={styles.side} testID="hud-end">
        {day === null && !replay ? (
          <SkipChip ui={ui} onSkip={onSkip} disabled={skipDisabled} />
        ) : null}
        <VipBadge />
        <CoinBadge source="game" />
      </View>
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
      hitSlop={(MIN_TOUCH_TARGET - controlHeights.sm) / 2}
      style={({ pressed }) => [
        styles.skip,
        { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.skipText, { color: ui.text }]}>{t('game.skip')}</Text>
      <Ionicons name="play" size={13} color={ui.accent} />
    </Pressable>
  );
};

export const SkipChip = memo(SkipChipComponent);

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleLayer: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  title: {
    flexShrink: 1,
    maxWidth: '100%',
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    ...typography.screenTitle,
  },
  skip: {
    minHeight: controlHeights.sm,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
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
