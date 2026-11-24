import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RewardBundle } from '@/config/economy';
import { isHardLevel } from '@/game/difficulty';
import { scaleReward } from '@/game/economy';
import { canClaimGift, canClaimVipBonus } from '@/game/gifts';
import { track } from '@/services/analytics';
import { prepareDaily } from '@/state/dailyLoader';
import { localToday } from '@/state/gameFlow';
import { isResumable, selectLevelSlot, useGameStore } from '@/state/gameStore';
import { prepareLevel } from '@/state/levelLoader';
import { claimDailyGift, claimVipDailyBonus, doubleGiftWithAd } from '@/state/metaFlow';
import { useProgressStore } from '@/state/progressStore';
import { effectiveQuality, useSettingsStore } from '@/state/settingsStore';
import { consumeAutoStart, shouldAutoStart } from '@/state/startup';
import { Button } from '@/ui/Button';
import { CoinBadge } from '@/ui/CoinBadge';
import { Crown } from '@/ui/game/Crown';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { AnimatedTitle } from '@/ui/home/AnimatedTitle';
import { DailyCard } from '@/ui/home/DailyCard';
import { HeroTubes } from '@/ui/home/HeroTubes';
import { Pulse } from '@/ui/home/Pulse';
import { StarterPackBanner } from '@/ui/home/StarterPackBanner';
import type { IconName } from '@/ui/IconButton';
import { Screen } from '@/ui/Screen';
import { revealApp } from '@/ui/splash';
import { useActiveTheme, useReducedMotionPref } from '@/ui/theme';
import { showToast } from '@/ui/Toast';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

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
  color: string;
  surface: string;
}

const MenuButton = ({ icon, label, onPress, color, surface }: MenuButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [
      styles.menuButton,
      { backgroundColor: surface },
      pressed && styles.pressed,
    ]}
  >
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[styles.menuLabel, { color }]} numberOfLines={1}>
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
  const [focused, setFocused] = useState(true);
  const [today, setToday] = useState(() => localToday());
  const [reward, setReward] = useState<HomeReward | null>(null);
  const [busy, setBusy] = useState(false);
  const giftReady = useProgressStore((state) => canClaimGift(state, today));
  const vipBonusReady = useProgressStore((state) =>
    canClaimVipBonus(state, today, state.entitlements.vip),
  );
  const hard = isHardLevel(level);

  useEffect(() => {
    if (autoStart) {
      consumeAutoStart();
      return;
    }
    revealApp();
  }, [autoStart]);

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

  if (autoStart) return <Redirect href={{ pathname: '/game', params: { mode: 'level' } }} />;

  const animate = focused && !reducedMotion;
  const heroAnimates = animate && quality === 'high';

  const overlay =
    reward === null ? null : reward.kind === 'gift' ? (
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
    <Screen showBack={false} scroll overlay={overlay}>
      <View style={styles.topRow}>
        <Pulse active={giftReady && animate}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={giftReady ? t('gift.readyA11y') : t('gift.waitA11y')}
            onPress={onGift}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: ui.surface, borderColor: giftReady ? ui.accent : ui.surface },
              pressed && styles.pressed,
            ]}
            testID="gift-button"
          >
            <Ionicons name="gift" size={22} color={giftReady ? ui.accent : ui.textMuted} />
            <Text style={[styles.chipText, { color: ui.text }]}>{t('gift.button')}</Text>
          </Pressable>
        </Pulse>
        {vipBonusReady ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('vipBonus.a11y')}
            onPress={onVipBonus}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: ui.surface, borderColor: ui.accent },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="diamond" size={20} color={ui.accent} />
            <Text style={[styles.chipText, { color: ui.text }]}>{t('vipBonus.button')}</Text>
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        <CoinBadge source="home" />
      </View>
      {canResume ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.resumeA11y', { n: level })}
          onPress={openLevel}
          style={({ pressed }) => [
            styles.resume,
            { backgroundColor: ui.surface },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="play-circle" size={28} color={ui.accent} />
          <Text style={[styles.resumeText, { color: ui.text }]}>
            {t('home.resume', { n: level })}
          </Text>
          <Ionicons
            name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
            size={20}
            color={ui.textMuted}
          />
        </Pressable>
      ) : null}
      <View style={styles.hero}>
        <AnimatedTitle text={t('app.name')} color={ui.text} animate={animate} />
        <HeroTubes theme={theme} colorBlind={colorBlind} animate={heroAnimates} />
        <Button
          variant="primary"
          label={t('home.play', { n: level })}
          accessibilityLabel={
            hard ? t('home.playHardA11y', { n: level }) : t('home.playA11y', { n: level })
          }
          onPress={openLevel}
          leading={hard ? <Crown /> : undefined}
          ui={ui}
          style={styles.play}
        />
      </View>
      <DailyCard ui={ui} today={today} onPlay={openDaily} onOpen={() => router.push('/daily')} />
      <StarterPackBanner ui={ui} onView={() => openShop('starter_pack_banner')} />
      <View style={styles.menu}>
        <MenuButton
          icon="cart"
          label={t('home.shop')}
          onPress={() => openShop('home')}
          color={ui.text}
          surface={ui.surface}
        />
        <MenuButton
          icon="color-palette"
          label={t('home.themes')}
          onPress={() => router.push('/themes')}
          color={ui.text}
          surface={ui.surface}
        />
        <MenuButton
          icon="settings"
          label={t('home.settings')}
          onPress={() => router.push('/settings')}
          color={ui.text}
          surface={ui.surface}
        />
      </View>
      {__DEV__ ? (
        <Button label="Dev: stress test" onPress={() => router.push('/dev-stress')} ui={ui} />
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
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
  },
  pressed: {
    opacity: 0.8,
  },
  resume: {
    minHeight: MIN_TOUCH_TARGET + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
  },
  resumeText: {
    flex: 1,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
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
    gap: spacing.md,
  },
  menuButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  menuLabel: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.semibold,
  },
});
