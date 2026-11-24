import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { getLevel } from '@/game/generator';
import type { Level } from '@/game/types';
import { BoardView } from '@/render/Board';
import type { Rect } from '@/render/layout';
import type { CanvasSize } from '@/render/scene';
import { getTheme, type Theme } from '@/render/themes';
import { useBoardState } from '@/render/useBoardState';
import { useRenderSettings } from '@/render/useRenderSettings';
import { play } from '@/services/audio';
import { hapticError, hapticPourStart, hapticSelect, hapticSuccess } from '@/services/haptics';
import { useProgressStore } from '@/state/progressStore';
import { FpsOverlay } from '@/ui/FpsOverlay';
import { IconButton } from '@/ui/IconButton';
import { goBack } from '@/ui/Screen';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, spacing } from '@/ui/tokens';
import { logger } from '@/utils/logger';

/** Height reserved for the top bar (pause, level title, coins; phase 5). */
const TOP_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.md;
/** Height reserved for the bottom action bar (undo, hint, restart, +tube; phase 5). */
const BOTTOM_BAR_HEIGHT = MIN_TOUCH_TARGET + spacing.xxl;

const parseLevel = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const level = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(level) && level >= 1 ? level : null;
};

const onPourStart = (): void => {
  play('pour');
  hapticPourStart();
};

const onPourLand = (): void => play('drop');

const onTubeComplete = (): void => {
  play('complete');
  hapticSuccess();
};

const onInvalidMove = (): void => {
  play('error');
  hapticError();
};

const onWinStart = (): void => {
  play('win');
  hapticSuccess();
};

interface GameBoardProps {
  level: Level;
  size: CanvasSize;
  area: Rect;
  theme: Theme;
}

/** Owns the board state of one level; remounted (via `key`) when the level changes. */
const GameBoard = ({ level, size, area, theme }: GameBoardProps) => {
  const { colorBlind, quality, reducedMotion } = useRenderSettings();
  const { board, setSelected, commitPour } = useBoardState(level.board);
  const levelId = level.id;

  const onSelect = useCallback(
    (index: number) => {
      setSelected(index);
      if (index < 0) return;
      play('select');
      hapticSelect();
    },
    [setSelected],
  );

  // Phase 5 shows the win overlay here.
  const onWinSequenceEnd = useCallback(() => {
    if (__DEV__) logger.debug('Win sequence finished', levelId);
  }, [levelId]);

  return (
    <BoardView
      board={board}
      size={size}
      area={area}
      theme={theme}
      colorBlind={colorBlind}
      quality={quality}
      reducedMotion={reducedMotion}
      onSelect={onSelect}
      onPour={commitPour}
      onPourStart={onPourStart}
      onPourLand={onPourLand}
      onTubeComplete={onTubeComplete}
      onInvalidMove={onInvalidMove}
      onWinStart={onWinStart}
      onWinSequenceEnd={onWinSequenceEnd}
    />
  );
};

export default function GameScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; level?: string }>();
  const progressLevel = useProgressStore((state) => state.level);
  const themeId = useProgressStore((state) => state.activeTheme);
  const levelNumber = parseLevel(params.level) ?? progressLevel;
  const level = useMemo(() => getLevel(levelNumber), [levelNumber]);
  const theme = getTheme(themeId);
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<CanvasSize | null>(null);
  const [showFps, setShowFps] = useState(false);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous !== null && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const toggleFps = useCallback(() => setShowFps((visible) => !visible), []);

  const area = useMemo<Rect | null>(() => {
    if (size === null) return null;
    const x = insets.left + spacing.sm;
    const y = insets.top + TOP_BAR_HEIGHT;
    return {
      x,
      y,
      width: Math.max(0, size.width - x - insets.right - spacing.sm),
      height: Math.max(0, size.height - y - insets.bottom - BOTTOM_BAR_HEIGHT),
    };
  }, [size, insets.left, insets.top, insets.right, insets.bottom]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background[0] }]} onLayout={onLayout}>
      <StatusBar style={theme.statusBar} />
      {size !== null && area !== null ? (
        <GameBoard key={level.id} level={level} size={size} area={area} theme={theme} />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.topBar,
          { top: insets.top, start: insets.left + spacing.sm, end: insets.right + spacing.sm },
        ]}
      >
        <IconButton
          icon={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
          accessibilityLabel={t('common.back')}
          onPress={goBack}
          color={theme.ui.text}
        />
        <Pressable
          accessibilityRole="header"
          onLongPress={__DEV__ ? toggleFps : undefined}
          style={styles.title}
        >
          <Text style={[styles.titleText, { color: theme.ui.text }]}>
            {t('game.title', { n: levelNumber })}
          </Text>
        </Pressable>
        <View style={styles.barSpacer} />
      </View>
      {__DEV__ && showFps ? (
        <View
          pointerEvents="none"
          style={[styles.fps, { top: insets.top + TOP_BAR_HEIGHT, end: insets.right + spacing.sm }]}
        >
          <FpsOverlay />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  barSpacer: {
    width: MIN_TOUCH_TARGET,
  },
  fps: {
    position: 'absolute',
  },
});
