import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  MANAGE_SUBSCRIPTIONS_URL,
  PRIVACY_URL,
  SUPPORT_MAILTO,
  TERMS_URL,
} from '@/config/constants';
import {
  i18n,
  initI18n,
  SUPPORTED_LANGUAGES,
  syncLayoutDirection,
  type LanguagePreference,
} from '@/i18n';
import { languageNativeName } from '@/i18n/format';
import { track } from '@/services/analytics';
import { deleteAccount } from '@/services/auth';
import { isPrivacyOptionsRequired, showPrivacyOptions, subscribeConsent } from '@/services/consent';
import { restorePurchases } from '@/services/fulfillment';
import {
  getNotificationPermission,
  requestNotificationPermission,
  subscribeNotificationPermission,
  syncNotificationPermission,
} from '@/services/notifications';
import { resetAllProgress } from '@/state/metaFlow';
import { useProgressStore, type NotificationToggle } from '@/state/progressStore';
import {
  useSettingsStore,
  type QualitySetting,
  type ReducedMotionSetting,
} from '@/state/settingsStore';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';
import { Screen } from '@/ui/Screen';
import { AccountSection } from '@/ui/settings/AccountSection';
import { ChoiceRow, InfoRow, LinkRow, SettingsSection, ToggleRow } from '@/ui/settings/rows';
import { Sheet } from '@/ui/Sheet';
import { useThemeUi } from '@/ui/theme';
import { showToast } from '@/ui/Toast';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';
import { logger } from '@/utils/logger';

type Modal = 'language' | 'reset' | 'resetConfirm' | 'delete' | 'deleteConfirm' | null;

const MOTION_OPTIONS: readonly ReducedMotionSetting[] = ['system', 'on', 'off'];
const QUALITY_OPTIONS: readonly QualitySetting[] = ['auto', 'high', 'low'];

const changed = (setting: string, value: string | boolean): void =>
  track('setting_changed', { setting, value: String(value) });

const openLink = (url: string): void => {
  Linking.openURL(url).catch((error: unknown) => {
    logger.warn('Could not open link', url, error);
    showToast('settings.linkFailed');
  });
};

/** Native version name and build number; null where the platform does not report them. */
const appVersion = (): { version: string; build: string } | null => {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  return version === null || build === null ? null : { version, build };
};

export default function SettingsScreen() {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const sound = useSettingsStore((state) => state.sound);
  const haptics = useSettingsStore((state) => state.haptics);
  const colorBlind = useSettingsStore((state) => state.colorBlind);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const quality = useSettingsStore((state) => state.quality);
  const downgraded = useSettingsStore((state) => state.autoQualityDowngraded);
  const language = useSettingsStore((state) => state.language);
  const [modal, setModal] = useState<Modal>(null);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [versionInfo] = useState(appVersion);
  const [restoring, setRestoring] = useState(false);
  const privacyOptionsRequired = useSyncExternalStore(subscribeConsent, isPrivacyOptionsRequired);
  const notifications = useProgressStore((state) => state.notifications);
  const permission = useSyncExternalStore(
    subscribeNotificationPermission,
    getNotificationPermission,
  );

  useEffect(() => {
    void syncNotificationPermission();
  }, []);

  /** Whether Android lets Pourly post notifications (the stored mirror until it is read). */
  const notificationsAllowed = permission?.granted ?? notifications.granted;
  /** Android will not show its prompt again: only the app's system settings can allow them. */
  const notificationsBlocked =
    permission !== null && !permission.granted && !permission.canAskAgain;

  const settings = () => useSettingsStore.getState();

  const onLanguage = useCallback((next: LanguagePreference) => {
    setModal(null);
    useSettingsStore.getState().setLanguage(next);
    changed('language', next);
    initI18n(next)
      .then(() => {
        if (syncLayoutDirection(i18n.language)) setRestartNeeded(true);
      })
      .catch((error: unknown) => logger.error('Language change failed', error));
  }, []);

  const onReset = useCallback(() => {
    setResetting(true);
    resetAllProgress()
      .then(() => {
        changed('reset_progress', true);
        setModal(null);
        router.replace({ pathname: '/game', params: { mode: 'level' } });
      })
      .catch((error: unknown) => logger.error('Reset failed', error))
      .finally(() => setResetting(false));
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const openDelete = useCallback(() => setModal('delete'), []);

  const onDeleteAccount = useCallback(() => {
    setModal(null);
    void deleteAccount();
  }, []);

  const onRestore = useCallback(() => {
    setRestoring(true);
    restorePurchases().finally(() => setRestoring(false));
  }, []);

  /**
   * A reminder toggle. The choice is stored either way; turning one on without permission opens
   * Android's prompt, or the app's system settings once Android no longer shows that prompt. The
   * schedule follows the stored choice and permission (see `notifications.ts`).
   */
  const onReminderToggle = useCallback(
    (toggle: NotificationToggle, value: boolean) => {
      useProgressStore.getState().setNotificationToggle(toggle, value);
      changed(toggle === 'dailyEnabled' ? 'dailyReminders' : 'streakReminders', value);
      if (!value || notificationsAllowed) return;
      if (notificationsBlocked) {
        Linking.openSettings().catch((error: unknown) => {
          logger.warn('Could not open the app settings', error);
          showToast('settings.openSettingsFailed');
        });
        return;
      }
      void requestNotificationPermission();
    },
    [notificationsAllowed, notificationsBlocked],
  );

  const onAdPrivacy = useCallback(() => {
    showPrivacyOptions()
      .then((opened) => {
        if (!opened) showToast('settings.adPrivacyFailed');
      })
      .catch((error: unknown) => logger.warn('Ad privacy options failed', error));
  }, []);

  const chosen = SUPPORTED_LANGUAGES.find((lng) => lng === language);
  const languageName =
    chosen === undefined ? t('settings.languageSystem') : languageNativeName(chosen);

  const languageChoices: readonly { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    ...SUPPORTED_LANGUAGES.map((lng) => ({ value: lng, label: languageNativeName(lng) })),
  ];

  const overlay =
    modal === 'language' ? (
      <Sheet title={t('settings.language')} onClose={closeModal} testID="language-sheet">
        <View accessibilityRole="radiogroup" style={styles.languages}>
          {languageChoices.map((choice) => {
            const selected = choice.value === language;
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="radio"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected, checked: selected }}
                onPress={() => onLanguage(choice.value)}
                style={({ pressed }) => [
                  styles.languageRow,
                  { borderColor: selected ? ui.accent : ui.textMuted },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.languageText, { color: ui.text }]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Button label={t('common.close')} onPress={closeModal} ui={ui} />
      </Sheet>
    ) : modal === 'reset' ? (
      <Overlay
        title={t('settings.resetTitle')}
        message={t('settings.resetMessage')}
        onBackdropPress={closeModal}
        testID="reset-step-1"
      >
        <Button
          label={t('settings.resetContinue')}
          onPress={() => setModal('resetConfirm')}
          ui={ui}
        />
        <Button variant="primary" label={t('common.cancel')} onPress={closeModal} ui={ui} />
      </Overlay>
    ) : modal === 'resetConfirm' ? (
      <Overlay
        title={t('settings.resetConfirmTitle')}
        message={t('settings.resetConfirmMessage')}
        onBackdropPress={closeModal}
        testID="reset-step-2"
      >
        <Button
          label={t('settings.resetConfirm')}
          onPress={onReset}
          disabled={resetting}
          ui={ui}
          testID="reset-confirm"
        />
        <Button variant="primary" label={t('common.cancel')} onPress={closeModal} ui={ui} />
      </Overlay>
    ) : modal === 'delete' ? (
      <Overlay
        title={t('account.deleteTitle')}
        message={t('account.deleteMessage')}
        onBackdropPress={closeModal}
        testID="delete-step-1"
      >
        <Button
          label={t('account.deleteContinue')}
          onPress={() => setModal('deleteConfirm')}
          ui={ui}
        />
        <Button variant="primary" label={t('common.cancel')} onPress={closeModal} ui={ui} />
      </Overlay>
    ) : modal === 'deleteConfirm' ? (
      <Overlay
        title={t('account.deleteConfirmTitle')}
        message={t('account.deleteConfirmMessage')}
        onBackdropPress={closeModal}
        testID="delete-step-2"
      >
        <Button
          label={t('account.deleteConfirm')}
          onPress={onDeleteAccount}
          ui={ui}
          testID="delete-confirm"
        />
        <Button variant="primary" label={t('common.cancel')} onPress={closeModal} ui={ui} />
      </Overlay>
    ) : null;

  return (
    <Screen title={t('settings.title')} scroll overlay={overlay}>
      <AccountSection ui={ui} onDelete={openDelete} />
      <SettingsSection ui={ui} title={t('settings.sections.sound')}>
        <ToggleRow
          ui={ui}
          icon={sound ? 'volume-high' : 'volume-mute'}
          label={t('settings.sound')}
          value={sound}
          onChange={(value) => {
            settings().setSound(value);
            changed('sound', value);
          }}
        />
        <ToggleRow
          ui={ui}
          icon="phone-portrait"
          label={t('settings.haptics')}
          value={haptics}
          onChange={(value) => {
            settings().setHaptics(value);
            changed('haptics', value);
          }}
        />
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.notifications')}>
        <ToggleRow
          ui={ui}
          icon="notifications"
          label={t('settings.dailyReminders')}
          hint={t('settings.dailyRemindersHint')}
          value={notificationsAllowed && notifications.dailyEnabled}
          onChange={(value) => onReminderToggle('dailyEnabled', value)}
          testID="setting-daily-reminders"
        />
        <ToggleRow
          ui={ui}
          icon="flame"
          label={t('settings.streakReminders')}
          hint={t('settings.streakRemindersHint')}
          value={notificationsAllowed && notifications.streakEnabled}
          onChange={(value) => onReminderToggle('streakEnabled', value)}
          testID="setting-streak-reminders"
        />
        {notificationsAllowed ? null : (
          <InfoRow
            ui={ui}
            text={t(
              notificationsBlocked ? 'settings.notificationsBlocked' : 'settings.notificationsOff',
            )}
          />
        )}
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.display')}>
        <ToggleRow
          ui={ui}
          icon="shapes"
          label={t('settings.colorBlind')}
          hint={t('settings.colorBlindHint')}
          value={colorBlind}
          onChange={(value) => {
            settings().setColorBlind(value);
            changed('colorBlind', value);
          }}
          testID="setting-color-blind"
        />
        <ChoiceRow
          ui={ui}
          icon="walk"
          label={t('settings.reducedMotion')}
          options={MOTION_OPTIONS.map((value) => ({ value, label: t(`settings.motion.${value}`) }))}
          value={reducedMotion}
          onChange={(value) => {
            settings().setReducedMotion(value);
            changed('reducedMotion', value);
          }}
          optionA11y={(option) =>
            t('settings.optionA11y', { setting: t('settings.reducedMotion'), option })
          }
        />
        <ChoiceRow
          ui={ui}
          icon="speedometer"
          label={t('settings.quality')}
          hint={quality === 'auto' && downgraded ? t('settings.qualityLowered') : undefined}
          options={QUALITY_OPTIONS.map((value) => ({
            value,
            label: t(`settings.qualityOptions.${value}`),
          }))}
          value={quality}
          onChange={(value) => {
            settings().setQuality(value);
            changed('quality', value);
          }}
          optionA11y={(option) =>
            t('settings.optionA11y', { setting: t('settings.quality'), option })
          }
        />
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.language')}>
        <LinkRow
          ui={ui}
          icon="language"
          label={t('settings.language')}
          value={languageName}
          accessibilityLabel={t('settings.languageA11y', { name: languageName })}
          onPress={() => setModal('language')}
          testID="setting-language"
        />
        {restartNeeded ? <InfoRow ui={ui} text={t('settings.rtlRestart')} /> : null}
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.purchases')}>
        <LinkRow
          ui={ui}
          icon="refresh"
          label={t('settings.restorePurchases')}
          hint={t('settings.restoreHint')}
          disabled={restoring}
          onPress={onRestore}
          testID="setting-restore"
        />
        <LinkRow
          ui={ui}
          icon="card"
          label={t('settings.manageSubscription')}
          external
          onPress={() => openLink(MANAGE_SUBSCRIPTIONS_URL)}
          testID="setting-manage-subscription"
        />
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.about')}>
        <LinkRow
          ui={ui}
          icon="shield-checkmark"
          label={t('settings.privacy')}
          external
          onPress={() => openLink(PRIVACY_URL)}
        />
        <LinkRow
          ui={ui}
          icon="document-text"
          label={t('settings.terms')}
          external
          onPress={() => openLink(TERMS_URL)}
        />
        {privacyOptionsRequired ? (
          <LinkRow
            ui={ui}
            icon="options"
            label={t('settings.adPrivacy')}
            hint={t('settings.adPrivacyHint')}
            onPress={onAdPrivacy}
            testID="setting-ad-privacy"
          />
        ) : null}
        <LinkRow
          ui={ui}
          icon="mail"
          label={t('settings.support')}
          external
          onPress={() => openLink(SUPPORT_MAILTO)}
        />
        {versionInfo !== null ? (
          <InfoRow ui={ui} text={t('settings.version', versionInfo)} />
        ) : null}
      </SettingsSection>
      <SettingsSection ui={ui} title={t('settings.sections.progress')}>
        <LinkRow
          ui={ui}
          icon="refresh"
          label={t('settings.reset')}
          hint={t('settings.resetHint')}
          onPress={() => setModal('reset')}
          testID="setting-reset"
        />
      </SettingsSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: {
    gap: spacing.sm,
  },
  languageRow: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  languageText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  pressed: {
    opacity: 0.7,
  },
});
