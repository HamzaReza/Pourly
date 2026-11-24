import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';
import { initAudio, shutdownAudio } from '@/services/audio';
import { waitForStoresHydrated } from '@/state/hydration';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { colors } from '@/ui/tokens';
import { logger } from '@/utils/logger';

void SplashScreen.preventAutoHideAsync();

const bootstrap = async (): Promise<void> => {
  await waitForStoresHydrated();
  await initI18n(useSettingsStore.getState().language);
  useProgressStore.getState().touchOpen(Date.now());
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
    if (ready) SplashScreen.hide();
  }, [ready]);

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
