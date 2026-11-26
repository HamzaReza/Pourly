import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  chapterOf,
  firstLevelOf,
  gateOf,
  isChapterUnlocked,
  type ChapterGate,
} from '@/game/chapters';
import { isHardLevel } from '@/game/difficulty';
import { PRECOMPUTED_LEVEL_COUNT } from '@/game/generator';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import type { StarCount } from '@/state/progressModel';
import { track } from '@/services/analytics';
import { useProgressStore } from '@/state/progressStore';
import { ChapterGateOverlay } from '@/ui/game/overlays/ChapterGateOverlay';
import { Crown } from '@/ui/game/Crown';
import { Screen } from '@/ui/Screen';
import { surfaceColors, useActiveTheme } from '@/ui/theme';
import {
  alphas,
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
  typography,
  withAlpha,
} from '@/ui/tokens';
import { withGoldStars } from '@/ui/goldStars';
import { Text } from '@/ui/Text';

/** Cells per row. */
const COLUMNS = 5;
/** Levels per chapter (4 rows). */
export const CHAPTER_SIZE = 20;
const GAP = spacing.sm;
/** Fixed height of a chapter header (title, progress, bar and spacing). */
const HEADER_HEIGHT = 64;
/** Fixed height of the "N levels completed" line that scrolls with the list. */
const INTRO_HEIGHT = 28;
/** Opacity of a locked level's number. */
const LOCKED_ALPHA = 0.4;

/** Opens the completed `level` as a replay (its own session; progress is untouched). */
const openReplay = (level: number): void => {
  router.push({ pathname: '/game', params: { mode: 'replay', level: String(level) } });
};

/** The current level continues the normal progression, like Home's main button. */
const openCurrent = (): void => {
  router.push({ pathname: '/game', params: { mode: 'level' } });
};

type CellState =
  | { readonly kind: 'done'; readonly stars: StarCount }
  | { readonly kind: 'current' }
  | { readonly kind: 'locked' };

interface LevelCellProps {
  ui: ThemeUi;
  level: number;
  state: CellState;
  size: number;
}

/**
 * One level tile: the number with three star slots under it (completed), an accent ring and a
 * play glyph (current), or dimmed with a lock (not reached yet; not pressable). Hard levels wear
 * a small crown in the top-end corner.
 */
const LevelCellComponent = ({ ui, level, state, size }: LevelCellProps) => {
  const { t } = useTranslation();
  const hard = isHardLevel(level);
  const n = formatNumber(level);
  const surfaces = surfaceColors(ui);
  const base =
    state.kind === 'done'
      ? t('levels.cellA11y', { n, stars: formatNumber(state.stars) })
      : state.kind === 'current'
        ? t('levels.currentA11y', { n })
        : t('levels.lockedA11y', { n });
  const label = hard && state.kind !== 'locked' ? `${base} ${t('levels.hardA11y')}` : base;
  const locked = state.kind === 'locked';
  const current = state.kind === 'current';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={current ? openCurrent : () => openReplay(level)}
      style={({ pressed }) => [
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: current ? surfaces.accentTint : ui.surface,
          borderColor: current ? ui.accent : surfaces.hairline,
        },
        current && styles.currentCell,
        pressed && styles.pressed,
      ]}
      testID={`level-cell-${level}`}
    >
      {hard && !locked ? (
        <View style={styles.crown} pointerEvents="none">
          <Crown />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.number,
          { color: current ? ui.accent : locked ? withAlpha(ui.text, LOCKED_ALPHA) : ui.text },
        ]}
      >
        {n}
      </Text>
      {state.kind === 'done' ? (
        <View style={styles.stars}>
          {[1, 2, 3].map((index) => (
            <Ionicons
              key={index}
              name={index <= state.stars ? 'star' : 'star-outline'}
              size={11}
              color={index <= state.stars ? colors.star : withAlpha(ui.textMuted, alphas.border)}
            />
          ))}
        </View>
      ) : current ? (
        <Ionicons name="play" size={13} color={ui.accent} />
      ) : (
        <Ionicons
          name="lock-closed"
          size={16}
          color={withAlpha(ui.textMuted, 0.7)}
          testID={`level-lock-${level}`}
        />
      )}
    </Pressable>
  );
};

const LevelCell = memo(LevelCellComponent);

interface ChapterInfo {
  /** Chapter number (1-based). */
  readonly number: number;
  readonly from: number;
  readonly to: number;
  readonly done: number;
  readonly stars: number;
  /** Set while the chapter is locked (P12.7): its header opens the gate. */
  readonly gate: ChapterGate | null;
  /** Locked and so is the chapter before it: the header just says "Locked". */
  readonly behindGate: boolean;
}

interface ChapterHeaderProps {
  ui: ThemeUi;
  chapter: ChapterInfo;
  /** Opaque fill so the grid scrolls under the sticky header without showing through. */
  background: string;
  /** A locked chapter's header opens its gate. */
  onOpenGate: (chapter: number) => void;
}

/** "Levels 1–20" with "12/20 · 31★" and a thin progress bar. */
const ChapterHeaderComponent = ({ ui, chapter, background, onOpenGate }: ChapterHeaderProps) => {
  const { t } = useTranslation();
  const total = chapter.to - chapter.from + 1;
  const gate = chapter.gate;
  const surfaces = surfaceColors(ui);
  const frame = [
    styles.header,
    { backgroundColor: background, borderBottomColor: surfaces.hairline },
  ];
  const title = (
    <Text numberOfLines={1} style={[styles.headerTitle, { color: ui.textMuted }]}>
      {t('levels.chapter', { from: formatNumber(chapter.from), to: formatNumber(chapter.to) })}
    </Text>
  );
  const bar = (fraction: number, color: string) => (
    <View style={[styles.bar, { backgroundColor: surfaces.track }]}>
      <View
        style={[
          styles.barFill,
          { width: `${Math.round(Math.min(1, fraction) * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );

  // A chapter behind another locked chapter: nothing to aim for yet, just "Locked".
  if (gate !== null && chapter.behindGate) {
    return (
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('levels.chapter', {
          from: formatNumber(chapter.from),
          to: formatNumber(chapter.to),
        })}, ${t('chapters.locked')}`}
        style={frame}
        testID={`chapter-${chapter.from}`}
      >
        <View style={styles.headerRow}>
          {title}
          <View style={styles.headerStats}>
            <Ionicons name="lock-closed" size={12} color={ui.textMuted} />
            <Text numberOfLines={1} style={[styles.headerStat, { color: ui.textMuted }]}>
              {t('chapters.locked')}
            </Text>
          </View>
        </View>
        {bar(0, colors.star)}
      </View>
    );
  }

  // The next chapter to open: what is missing, in gold; tapping opens the gate.
  if (gate !== null) {
    const values = {
      n: formatNumber(chapter.number),
      prev: formatNumber(chapter.number - 1),
      stars: formatNumber(gate.stars),
      target: formatNumber(gate.target),
    };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chapters.headerLockedA11y', values)}
        onPress={() => onOpenGate(chapter.number)}
        style={({ pressed }) => [...frame, pressed && styles.pressed]}
        testID={`chapter-${chapter.from}`}
      >
        <View style={styles.headerRow}>
          {title}
          <View style={styles.headerStats}>
            <Ionicons name="lock-closed" size={12} color={colors.star} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.headerStat, { color: colors.star }]}
            >
              {t('chapters.headerToUnlock', values)}
            </Text>
          </View>
        </View>
        {bar(gate.stars / gate.target, colors.star)}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t('levels.chapterA11y', {
        from: formatNumber(chapter.from),
        to: formatNumber(chapter.to),
        done: formatNumber(chapter.done),
        total: formatNumber(total),
        stars: formatNumber(chapter.stars),
        maxStars: formatNumber(total * 3),
      })}
      style={frame}
      testID={`chapter-${chapter.from}`}
    >
      <View style={styles.headerRow}>
        {title}
        <View style={styles.headerStats}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.headerStat, { color: ui.textMuted }]}
          >
            {withGoldStars(
              `${formatNumber(chapter.done)}/${formatNumber(total)} · ${formatNumber(chapter.stars)}★`,
            )}
          </Text>
        </View>
      </View>
      {bar(total > 0 ? chapter.done / total : 0, ui.accent)}
    </View>
  );
};

const ChapterHeader = memo(ChapterHeaderComponent);

type Item =
  | { readonly kind: 'intro'; readonly key: string }
  | { readonly kind: 'header'; readonly key: string; readonly chapter: ChapterInfo }
  | { readonly kind: 'row'; readonly key: string; readonly levels: readonly number[] };

/** How many levels the screen lists: every precomputed level, or more once the player is past them. */
export const listedLevelCount = (current: number): number =>
  Math.max(PRECOMPUTED_LEVEL_COUNT, current);

export default function LevelsScreen() {
  const { t } = useTranslation();
  const theme = useActiveTheme();
  const ui = theme.ui;
  const { width: windowWidth } = useWindowDimensions();
  /** The list's own width (one horizontal padding, the Screen's, for headers, bars and grid). */
  const [listWidth, setListWidth] = useState<number | null>(null);
  const current = useProgressStore((state) => state.level);
  const stars = useProgressStore((state) => state.stars);
  const paidChapters = useProgressStore((state) => state.paidChapters);
  const vip = useProgressStore((state) => state.entitlements.vip);
  const params = useLocalSearchParams<{ chapter?: string }>();
  /** Chapter to open on (the gate's "Replay levels"); the current level's chapter otherwise. */
  const [focusChapter] = useState(() => {
    const value = Number(params.chapter);
    return Number.isInteger(value) && value >= 1 ? value : null;
  });
  const listRef = useRef<FlatList<Item>>(null);
  const [gateChapter, setGateChapter] = useState<number | null>(null);
  const closeGate = useCallback(() => setGateChapter(null), []);
  const openShop = useCallback(() => {
    setGateChapter(null);
    track('shop_opened', { from: 'chapter_gate' });
    router.push('/shop');
  }, []);
  const count = listedLevelCount(current);

  const available = listWidth ?? Math.min(windowWidth, 560) - spacing.lg * 2;
  const cellSize = (available - GAP * (COLUMNS - 1)) / COLUMNS;
  const rowHeight = cellSize + GAP;

  const { items, collected, completed } = useMemo(() => {
    const out: Item[] = [{ kind: 'intro', key: 'intro' }];
    let totalStars = 0;
    for (let from = 1; from <= count; from += CHAPTER_SIZE) {
      const to = Math.min(count, from + CHAPTER_SIZE - 1);
      let done = 0;
      let chapterStars = 0;
      for (let level = from; level <= to && level < current; level += 1) {
        done += 1;
        chapterStars += stars[level] ?? 1;
      }
      totalStars += chapterStars;
      out.push({
        kind: 'header',
        key: `h${from}`,
        chapter: {
          number: chapterOf(from),
          from,
          to,
          done,
          stars: chapterStars,
          gate: gateOf({ stars, paidChapters, entitlements: { vip } }, chapterOf(from)),
          behindGate: !isChapterUnlocked({ stars, paidChapters }, chapterOf(from) - 1),
        },
      });
      for (let first = from; first <= to; first += COLUMNS) {
        const levels: number[] = [];
        for (let level = first; level < first + COLUMNS && level <= to; level += 1) {
          levels.push(level);
        }
        out.push({ kind: 'row', key: `r${first}`, levels });
      }
    }
    return { items: out, collected: totalStars, completed: Math.max(0, current - 1) };
  }, [count, current, stars, paidChapters, vip]);

  const heightOf = useCallback(
    (item: Item | undefined): number =>
      item?.kind === 'header' ? HEADER_HEIGHT : item?.kind === 'intro' ? INTRO_HEIGHT : rowHeight,
    [rowHeight],
  );

  const offsets = useMemo(() => {
    const out: number[] = [];
    let offset = 0;
    for (const item of items) {
      out.push(offset);
      offset += heightOf(item);
    }
    return out;
  }, [items, heightOf]);

  /** The chapter headers stick to the top while their levels scroll under them. */
  const stickyIndices = useMemo(
    () => items.flatMap((item, index) => (item.kind === 'header' ? [index] : [])),
    [items],
  );

  /** Opens on the current level's chapter, so its header and progress are in view. */
  const initialIndex = useMemo(() => {
    const target = focusChapter !== null ? firstLevelOf(focusChapter) : Math.min(current, count);
    const index = items.findIndex(
      (item) => item.kind === 'header' && item.chapter.from <= target && target <= item.chapter.to,
    );
    // The first chapter opens at the very top, with the "N levels completed" line.
    return index <= 1 ? 0 : index;
  }, [items, current, count, focusChapter]);

  /** "Replay levels" from a gate on this screen: scroll to the chapter to earn stars in. */
  const replayChapter = useCallback(
    (chapter: number) => {
      setGateChapter(null);
      const index = items.findIndex(
        (item) => item.kind === 'header' && item.chapter.number === chapter,
      );
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true });
    },
    [items],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Item> | null | undefined, index: number) => ({
      length: heightOf(items[index]),
      offset: offsets[index] ?? 0,
      index,
    }),
    [items, offsets, heightOf],
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === 'intro' ? (
        <Text style={[styles.subtitle, { color: ui.textMuted }]} testID="levels-completed">
          {t('levels.completed', { count: completed, value: formatNumber(completed) })}
        </Text>
      ) : item.kind === 'header' ? (
        <ChapterHeader
          ui={ui}
          chapter={item.chapter}
          background={theme.background[0] ?? ui.surface}
          onOpenGate={setGateChapter}
        />
      ) : (
        <View style={[styles.row, { height: rowHeight }]}>
          {item.levels.map((level) => (
            <LevelCell
              key={level}
              ui={ui}
              level={level}
              state={
                level < current
                  ? { kind: 'done', stars: stars[level] ?? 1 }
                  : level === current &&
                      isChapterUnlocked({ stars, paidChapters }, chapterOf(level))
                    ? { kind: 'current' }
                    : { kind: 'locked' }
              }
              size={cellSize}
            />
          ))}
        </View>
      ),
    [ui, theme, t, completed, current, stars, paidChapters, cellSize, rowHeight],
  );

  return (
    <Screen
      title={t('levels.title')}
      overlay={
        gateChapter !== null ? (
          <ChapterGateOverlay
            ui={ui}
            chapter={gateChapter}
            onReplay={replayChapter}
            onUnlocked={closeGate}
            onClose={closeGate}
            onShop={openShop}
          />
        ) : null
      }
      headerEnd={
        <View
          accessible
          accessibilityLabel={t('levels.starsA11y', {
            value: formatNumber(collected),
            max: formatNumber(count * 3),
          })}
          style={[
            styles.total,
            { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
          ]}
          testID="levels-total-stars"
        >
          <Ionicons name="star" size={13} color={colors.star} />
          <Text style={[styles.totalText, { color: ui.text }]}>
            {`${formatNumber(collected)} / ${formatNumber(count * 3)}`}
          </Text>
        </View>
      }
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        stickyHeaderIndices={stickyIndices}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setListWidth((previous) => (previous === width ? previous : width));
        }}
        initialScrollIndex={initialIndex}
        initialNumToRender={14}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="levels-list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...typography.rowHint,
    height: INTRO_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    /** Marks where the grid slides under the sticky header. */
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    ...typography.sectionLabel,
    flexShrink: 0,
  },
  headerStats: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginStart: spacing.md,
    /** Keeps the stats off the screen edge. */
    paddingEnd: spacing.xs,
  },
  headerStat: {
    flexShrink: 1,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: 3,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  cell: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + spacing.xxs,
  },
  currentCell: {
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.75,
  },
  crown: {
    position: 'absolute',
    top: spacing.xs,
    end: spacing.xs,
    transform: [{ scale: 0.7 }],
  },
  number: {
    fontSize: fontSizes.body + 1,
    fontWeight: fontWeights.heavy,
    fontVariant: ['tabular-nums'],
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  total: {
    minHeight: 36,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  totalText: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
});
