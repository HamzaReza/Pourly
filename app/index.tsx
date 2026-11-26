import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RewardBundle } from '@/config/economy';
import { isHardLevel } from '@/game/difficulty';
import { formatNumber } from '@/i18n/format';
import type { CanvasSize } from '@/render/scene';
import type { ThemeUi } from '@/render/themes';
import { scaleReward } from '@/game/economy';
import { canClaimGift, canClaimVipBonus } from '@/game/gifts';
import { track } from '@/services/analytics';
import { selectGatedChapter } from '@/state/chapterFlow';
import { prepareDaily } from '@/state/dailyLoader';
import { localToday } from '@/state/gameFlow';
import { isResumable, selectLevelSlot, useGameStore } from '@/state/gameStore';
import { prepareLevel } from '@/state/levelLoader';
import { claimDailyGift, claimVipDailyBonus, doubleGiftWithAd } from '@/state/metaFlow';
import { useProgressStore } from '@/state/progressStore';
import { effectiveQuality, useSettingsStore } from '@/state/settingsStore';
import { consumeAutoStart, consumeLaunchRoute, shouldAutoStart } from '@/state/startup';
import { Button } from '@/ui/Button';
import { CoinBadge } from '@/ui/CoinBadge';
import { Crown } from '@/ui/game/Crown';
import { ChapterGateOverlay } from '@/ui/game/overlays/ChapterGateOverlay';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { AnimatedTitle, titleSizeFor } from '@/ui/home/AnimatedTitle';
import { DailyCard } from '@/ui/home/DailyCard';
import { HeroTubes } from '@/ui/home/HeroTubes';
import { Pulse } from '@/ui/home/Pulse';
import { SignInCard } from '@/ui/home/SignInCard';
import { StarterPackBanner } from '@/ui/home/StarterPackBanner';
import type { IconName } from '@/ui/IconButton';
import { Screen } from '@/ui/Screen';
import { revealApp } from '@/ui/splash';
import { surfaceColors, useActiveTheme, useReducedMotionPref } from '@/ui/theme';
import { VipBadge } from '@/ui/VipBadge';
import { showToast } from '@/ui/Toast';
import {
  alphas,
  colors,
  fontSizes,
  fontWeights,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
  withAlpha,
} from '@/ui/tokens';
import { Text } from '@/ui/Text';

/**
 * The hero canvas keeps its top third free for the tilting pour; this share of it tucks under the
 * title so title → tubes reads about 1.5× the tubes → button gap.
 */
const HERO_TOP_TRIM = 0.26;

/** The hero illustration's aspect (the scene's default 220 × 150). */
const HERO_ASPECT = 150 / 220;

/**
 * Hero canvas size: as wide as the content allows (up to 320 dp), but no taller than ~24% of the
 * window so Home still fits a 360 × 640 dp phone.
 */
const heroSizeFor = (windowWidth: number, windowHeight: number): CanvasSize => {
  const maxWidth = Math.min(320, windowWidth - spacing.lg * 2);
  const height = Math.round(Math.min(maxWidth * HERO_ASPECT, windowHeight * 0.24));
  return { width: Math.round(height / HERO_ASPECT), height };
};

const CHIP_HEIGHT = 36;
/** Grows the 36 dp chips to a 44 dp touch target. */
const CHIP_SLOP = (MIN_TOUCH_TARGET - CHIP_HEIGHT) / 2;

const openLevel = (): void => {
  router.push({ pathname: '/game', params: { mode: 'level' } });
};

const openDaily = (): void => {
  router.push({ pathname: '/game', params: { mode: 'daily' } });
};

const openShop = (from: string): void => {
  track('shop_opened', { from });
  router.push('/shop');
};

/** What the reward card on Home shows. */
type HomeReward =
  | {
      readonly kind: 'gift';
      readonly reward: RewardBundle;
      readonly day: number;
      readonly chest: boolean;
      readonly doubled: boolean;
    }
  | { readonly kind: 'vip'; readonly reward: RewardBundle };

interface MenuButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  ui: ThemeUi;
  testID?: string;
}

/** One of the four Home destinations (2 × 2 grid): a tinted icon tile beside its label. */
const MenuButton = ({ icon, label, onPress, ui, testID }: MenuButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    testID={testID}
    style={({ pressed }) => [
      styles.menuButton,
      { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
      pressed && styles.pressed,
    ]}
  >
    <View style={[styles.menuIcon, { backgroundColor: surfaceColors(ui).accentTint }]}>
      <Ionicons name={icon} size={18} color={ui.accent} />
    </View>
    <Text style={[styles.menuLabel, { color: ui.text }]} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useActiveTheme();
  const ui = theme.ui;
  const colorBlind = useSettingsStore((state) => state.colorBlind);
  const quality = useSettingsStore((state) =>
    effectiveQuality(state.quality, state.autoQualityDowngraded),
  );
  const reducedMotion = useReducedMotionPref();
  const level = useProgressStore((state) => state.level);
  const canResume = useGameStore((state) => isResumable(selectLevelSlot(state), level));
  const [autoStart] = useState(shouldAutoStart);
  const [launchRoute] = useState(consumeLaunchRoute);
  const [focused, setFocused] = useState(true);
  const [today, setToday] = useState(() => localToday());
  const [reward, setReward] = useState<HomeReward | null>(null);
  const [busy, setBusy] = useState(false);
  const giftReady = useProgressStore((state) => canClaimGift(state, today));
  const vipBonusReady = useProgressStore((state) =>
    canClaimVipBonus(state, today, state.entitlements.vip),
  );
  const hard = isHardLevel(level);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const heroSize = useMemo(
    () => heroSizeFor(windowWidth, windowHeight),
    [windowWidth, windowHeight],
  );

  useEffect(() => {
    if (autoStart) {
      consumeAutoStart();
      return;
    }
    revealApp();
  }, [autoStart]);

  // A daily, streak or gift notification that launched the app opens the Daily screen over Home.
  useEffect(() => {
    if (launchRoute === '/daily') router.push('/daily');
  }, [launchRoute]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setToday(localToday());
      return () => setFocused(false);
    }, []),
  );

  // Get the level Play opens and today's daily ready while Home is idle.
  useEffect(() => {
    if (!autoStart && !canResume) void prepareLevel(level);
  }, [autoStart, canResume, level]);

  useEffect(() => {
    if (!autoStart) void prepareDaily(today);
  }, [autoStart, today]);

  // The Starter Pack window opens the first time the player is eligible (after level 8).
  useEffect(() => {
    useProgressStore.getState().openStarterPackWindow(Date.now());
  }, [level]);

  const onGift = useCallback(() => {
    const claim = claimDailyGift();
    if (claim.kind === 'granted') {
      setReward({
        kind: 'gift',
        reward: claim.reward,
        day: claim.day,
        chest: claim.chest,
        doubled: false,
      });
    } else {
      showToast('gift.comeBack');
    }
  }, []);

  const onVipBonus = useCallback(() => {
    const claim = claimVipDailyBonus();
    if (claim.kind === 'granted') setReward({ kind: 'vip', reward: claim.reward });
  }, []);

  const onDoubleGift = useCallback(() => {
    if (reward?.kind !== 'gift' || reward.doubled) return;
    setBusy(true);
    doubleGiftWithAd(reward.reward)
      .then((earned) => {
        if (earned) setReward({ ...reward, doubled: true });
      })
      .finally(() => setBusy(false));
  }, [reward]);

  const closeReward = useCallback(() => setReward(null), []);

  /** The chapter blocking progression (0 when open): the main button opens its gate (P12.7). */
  const gatedChapter = useProgressStore(selectGatedChapter);
  const [gateOpen, setGateOpen] = useState(false);
  const openGate = useCallback(() => setGateOpen(true), []);
  const closeGate = useCallback(() => setGateOpen(false), []);
  const gateReplay = useCallback((chapter: number) => {
    setGateOpen(false);
    router.push({ pathname: '/levels', params: { chapter: String(chapter) } });
  }, []);
  const gateShop = useCallback(() => {
    setGateOpen(false);
    openShop('chapter_gate');
  }, []);

  if (autoStart) return <Redirect href={{ pathname: '/game', params: { mode: 'level' } }} />;

  const animate = focused && !reducedMotion;
  const heroAnimates = animate && quality === 'high';

  const overlay =
    reward === null ? (
      gateOpen && gatedChapter > 0 ? (
        <ChapterGateOverlay
          ui={ui}
          chapter={gatedChapter}
          onReplay={gateReplay}
          onUnlocked={closeGate}
          onClose={closeGate}
          onShop={gateShop}
        />
      ) : null
    ) : reward.kind === 'gift' ? (
      <RewardOverlay
        ui={ui}
        title={reward.chest ? t('gift.chest') : t('gift.title')}
        message={reward.doubled ? t('gift.doubled') : t('gift.day', { day: reward.day })}
        reward={reward.doubled ? scaleReward(reward.reward, 2) : reward.reward}
        onContinue={closeReward}
      >
        {!reward.doubled ? (
          <Button
            label={t('gift.double')}
            accessibilityLabel={t('gift.doubleA11y')}
            onPress={onDoubleGift}
            disabled={busy}
            icon="play"
            ui={ui}
          />
        ) : null}
      </RewardOverlay>
    ) : (
      <RewardOverlay
        ui={ui}
        title={t('vipBonus.title')}
        message={t('vipBonus.message')}
        reward={reward.reward}
        onContinue={closeReward}
      />
    );

  return (
    <Screen showBack={false} scroll fill overlay={overlay}>
      <View style={styles.topRow}>
        <Pulse active={giftReady && animate}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={giftReady ? t('gift.readyA11y') : t('gift.waitA11y')}
            onPress={onGift}
            hitSlop={CHIP_SLOP}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: ui.surface,
                borderColor: giftReady ? ui.accent : surfaceColors(ui).hairline,
              },
              pressed && styles.pressed,
            ]}
            testID="gift-button"
          >
            <Ionicons
              name={giftReady ? 'gift' : 'gift-outline'}
              size={18}
              color={giftReady ? ui.accent : ui.textMuted}
            />
            <Text style={[styles.chipText, { color: ui.text }]}>{t('gift.button')}</Text>
          </Pressable>
        </Pulse>
        {vipBonusReady ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('vipBonus.a11y')}
            onPress={onVipBonus}
            hitSlop={CHIP_SLOP}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: ui.surface, borderColor: withAlpha(colors.coin, alphas.border) },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="diamond" size={16} color={colors.coin} />
            <Text style={[styles.chipText, { color: ui.text }]}>{t('vipBonus.button')}</Text>
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        <VipBadge />
        <CoinBadge source="home" />
      </View>
      <View style={styles.main}>
        <View style={styles.hero}>
          <AnimatedTitle
            text={t('app.name')}
            color={ui.text}
            accent={ui.accent}
            animate={animate}
            size={titleSizeFor(windowWidth)}
          />
          <View style={{ marginTop: -Math.round(heroSize.height * HERO_TOP_TRIM) }}>
            <HeroTubes
              theme={theme}
              colorBlind={colorBlind}
              animate={heroAnimates}
              size={heroSize}
            />
          </View>
          {gatedChapter > 0 ? (
            <Button
              variant="primary"
              label={t('chapters.homeCta', { n: formatNumber(gatedChapter) })}
              accessibilityLabel={t('chapters.homeCtaA11y', { n: formatNumber(gatedChapter) })}
              onPress={openGate}
              leading={<Ionicons name="lock-closed" size={18} color={ui.onAccent} />}
              ui={ui}
              style={styles.play}
              testID="home-play"
            />
          ) : (
            <Button
              variant="primary"
              label={canResume ? t('home.continue', { n: level }) : t('home.play', { n: level })}
              accessibilityLabel={
                canResume
                  ? t('home.resumeA11y', { n: level })
                  : hard
                    ? t('home.playHardA11y', { n: level })
                    : t('home.playA11y', { n: level })
              }
              onPress={openLevel}
              leading={hard ? <Crown /> : undefined}
              icon="play"
              ui={ui}
              style={styles.play}
              testID="home-play"
            />
          )}
        </View>
        <DailyCard ui={ui} today={today} onPlay={openDaily} onOpen={() => router.push('/daily')} />
        <StarterPackBanner ui={ui} onView={() => openShop('starter_pack_banner')} />
        <SignInCard ui={ui} />
        <View style={styles.menu}>
          <MenuButton
            icon="grid-outline"
            label={t('home.levels')}
            onPress={() => router.push('/levels')}
            ui={ui}
            testID="home-levels"
          />
          <MenuButton
            icon="bag-handle-outline"
            label={t('home.shop')}
            onPress={() => openShop('home')}
            ui={ui}
          />
          <MenuButton
            icon="color-palette-outline"
            label={t('home.themes')}
            onPress={() => router.push('/themes')}
            ui={ui}
          />
          <MenuButton
            icon="settings-outline"
            label={t('home.settings')}
            onPress={() => router.push('/settings')}
            ui={ui}
          />
        </View>
      </View>
      {__DEV__ ? (
        <Button
          variant="ghost"
          size="md"
          label="Dev: stress test"
          onPress={() => router.push('/dev-stress')}
          ui={ui}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  chip: {
    height: CHIP_HEIGHT,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - spacing.xxs,
  },
  chipText: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.bold,
  },
  pressed: {
    opacity: 0.8,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    /** Sits the centred cluster a little below the true centre, which reads as balanced. */
    paddingTop: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  play: {
    minWidth: 220,
  },
  menu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  menuButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: MIN_TOUCH_TARGET + spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...typography.rowTitle,
  },
});
