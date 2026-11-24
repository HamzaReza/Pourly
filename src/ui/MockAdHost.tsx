import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  closeMockAd,
  getMockAd,
  MOCK_AD_COUNTDOWN_SEC,
  subscribeMockAd,
  type MockAdRequest,
} from '@/services/ads.mock';

import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from './tokens';

const AD_BACKGROUND = '#111111';
const AD_TEXT = '#FFFFFF';
const AD_MUTED = '#BBBBBB';
const AD_ACCENT = '#FFD60A';

interface MockAdScreenProps {
  ad: MockAdRequest;
}

/** One mock ad: 3-second countdown, then the reward; the close button works at any time. */
const MockAdScreen = ({ ad }: MockAdScreenProps) => {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(MOCK_AD_COUNTDOWN_SEC);
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const completed = remaining === 0;

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, []);

  const close = (): void => closeMockAd(completed);
  const rewarded = ad.format === 'rewarded';
  let status: string;
  if (!rewarded) status = t('ads.mockInterstitial');
  else if (completed) status = t('ads.mockEarned');
  else status = t('ads.mockCountdown', { count: remaining });

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rewarded && !completed ? t('ads.mockCloseEarly') : t('ads.mockClose')}
          onPress={close}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={24} color={AD_TEXT} />
        </Pressable>
        <Text ref={titleRef} accessibilityRole="header" style={styles.title}>
          {t('ads.mockTitle')}
        </Text>
        {rewarded && ad.placement !== null ? (
          <Text style={styles.subtitle}>{t('ads.mockRewarded', { placement: ad.placement })}</Text>
        ) : null}
        <Text accessibilityLiveRegion="polite" style={[styles.status, completed && styles.done]}>
          {status}
        </Text>
      </View>
    </Modal>
  );
};

/** Renders the mock provider's full-screen ad while one is requested (root layout). */
const MockAdHostComponent = () => {
  const ad = useSyncExternalStore(subscribeMockAd, getMockAd);
  return ad === null ? null : <MockAdScreen key={ad.id} ad={ad} />;
};

export const MockAdHost = memo(MockAdHostComponent);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AD_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  close: {
    position: 'absolute',
    top: spacing.xxxl,
    end: spacing.lg,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    color: AD_TEXT,
    fontSize: fontSizes.heading,
    fontWeight: fontWeights.heavy,
    textAlign: 'center',
  },
  subtitle: {
    color: AD_MUTED,
    fontSize: fontSizes.body,
    textAlign: 'center',
  },
  status: {
    color: AD_MUTED,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.semibold,
  },
  done: {
    color: AD_ACCENT,
  },
});
