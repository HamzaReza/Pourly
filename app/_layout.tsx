import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { dailyLevelId } from '@/game/daily';
import { i18n, initI18n, syncLayoutDirection } from '@/i18n';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { initAudio, shutdownAudio } from '@/services/audio';
import { startAdsWhenEligible } from '@/services/consent';
import { startPurchases } from '@/services/fulfillment';
import { readLaunchRoute, startNotifications } from '@/services/notifications';
import { initGameLifecycle, localToday } from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { waitForStoresHydrated } from '@/state/hydration';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { decideAutoStart } from '@/state/startup';
import { MockAdHost } from '@/ui/MockAdHost';
import { MockPurchaseHost } from '@/ui/MockPurchaseHost';
import { revealApp } from '@/ui/splash';
import { ToastHost } from '@/ui/Toast';
import { colors } from '@/ui/tokens';
import { logger } from '@/utils/logger';

void SplashScreen.preventAutoHideAsync();

/** The first screen hides the splash once its content is laid out; this is only a safety net. */
const SPLASH_SAFETY_MS = 1500;

const bootstrap = async (): Promise<void> => {
  await waitForStoresHydrated();
  await initI18n(useSettingsStore.getState().language);
  syncLayoutDirection(i18n.language);
  const now = Date.now();
  const progress = useProgressStore.getState();
  progress.touchOpen(now);
  progress.enforceThemeEntitlements(now);
  useGameStore.getState().discardStale(progress.level, dailyLevelId(localToday(now)));
  decideAutoStart(await readLaunchRoute());
  track('app_open', { session: useProgressStore.getState().sessionCount });
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    let active = true;
    bootstrap()
      .catch((error: unknown) => logger.error('Startup failed', error))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(revealApp, SPLASH_SAFETY_MS);
    // Ads, purchases and notification scheduling start after the first frame, never on the
    // launch path (spec §12, §13, §14).
    let stopPurchases: () => void = () => undefined;
    let stopAds: () => void = () => undefined;
    let stopNotifications: () => void = () => undefined;
    const idle = requestIdleCallback(
      () => {
        ads.preload();
        stopPurchases = startPurchases();
        stopAds = startAdsWhenEligible();
        stopNotifications = startNotifications();
      },
      { timeout: 2000 },
    );
    return () => {
      clearTimeout(timer);
      cancelIdleCallback(idle);
      stopPurchases();
      stopAds();
      stopNotifications();
    };
  }, [ready]);

  useEffect(initGameLifecycle, []);

  useEffect(() => {
    initAudio().catch((error: unknown) => logger.error('Audio setup failed', error));
    return shutdownAudio;
  }, []);

  useEffect(() => {
    if (!ready) return;
    initI18n(language).catch((error: unknown) => logger.error('Language change failed', error));
  }, [language, ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: styles.content,
          }}
        />
        <ToastHost />
        <MockAdHost />
        <MockPurchaseHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    backgroundColor: colors.background,
  },
});
