import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { signInWithGoogle, signOut, useAuthStore } from '@/services/auth';
import { fontSizes, fontWeights, spacing, typography } from '@/ui/tokens';

import { InfoRow, LinkRow, SettingsSection } from './rows';
import { Text } from '@/ui/Text';

const AVATAR = 40;

interface ProfileRowProps {
  ui: ThemeUi;
  email: string | null;
  text: string;
}

/** The signed-in header: the email's initial in an accent circle, then the account line. */
const ProfileRow = ({ ui, email, text }: ProfileRowProps) => {
  const initial = email?.trim().charAt(0).toUpperCase() ?? '';
  return (
    <View style={styles.profile} accessible accessibilityLabel={text}>
      <View style={[styles.avatar, { backgroundColor: ui.accent }]}>
        {initial.length > 0 ? (
          <Text style={[styles.initial, { color: ui.onAccent }]}>{initial}</Text>
        ) : (
          <Ionicons name="person" size={20} color={ui.onAccent} />
        )}
      </View>
      <View style={styles.profileTexts}>
        <Text style={[styles.profileText, { color: ui.text }]} numberOfLines={2}>
          {text}
        </Text>
        <View style={styles.provider}>
          <Ionicons name="logo-google" size={12} color={ui.textMuted} />
          <Text style={[styles.providerText, { color: ui.textMuted }]}>Google</Text>
        </View>
      </View>
    </View>
  );
};

export interface AccountSectionProps {
  ui: ThemeUi;
  /** Opens the two-step "Delete account and data" confirmation. */
  onDelete: () => void;
}

/**
 * Settings → Account: "Sign in with Google" for guests, a profile header with Sign out and
 * Delete account and data when signed in, or a note when this build has no cloud features.
 */
const AccountSectionComponent = ({ ui, onDelete }: AccountSectionProps) => {
  const { t } = useTranslation();
  const available = useAuthStore((state) => state.available);
  const status = useAuthStore((state) => state.status);
  const email = useAuthStore((state) => state.user?.email ?? null);
  const pending = useAuthStore((state) => state.pending);
  const busy = pending !== null;

  const onSignIn = useCallback(() => {
    void signInWithGoogle();
  }, []);
  const onSignOut = useCallback(() => {
    void signOut();
  }, []);

  return (
    <SettingsSection ui={ui} title={t('settings.sections.account')}>
      {!available
        ? [
            <InfoRow
              key="unavailable"
              ui={ui}
              icon="cloud-offline-outline"
              text={t('account.unavailable')}
            />,
          ]
        : status === 'guest'
          ? [
              <LinkRow
                key="signIn"
                ui={ui}
                icon="logo-google"
                label={t('account.signIn')}
                hint={busy ? t('account.working') : t('account.signInHint')}
                disabled={busy}
                onPress={onSignIn}
                testID="setting-sign-in"
              />,
            ]
          : [
              <ProfileRow
                key="profile"
                ui={ui}
                email={email}
                text={email === null ? t('account.signedIn') : t('account.signedInAs', { email })}
              />,
              <LinkRow
                key="signOut"
                ui={ui}
                icon="log-out-outline"
                label={t('account.signOut')}
                hint={pending === 'signOut' ? t('account.working') : t('account.signOutHint')}
                disabled={busy}
                onPress={onSignOut}
                testID="setting-sign-out"
              />,
              <LinkRow
                key="delete"
                ui={ui}
                tone="danger"
                icon="trash-outline"
                label={t('account.delete')}
                hint={pending === 'delete' ? t('account.working') : t('account.deleteHint')}
                disabled={busy}
                onPress={onDelete}
                testID="setting-delete-account"
              />,
            ]}
    </SettingsSection>
  );
};

export const AccountSection = memo(AccountSectionComponent);

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: fontSizes.title - 2,
    fontWeight: fontWeights.heavy,
  },
  profileTexts: {
    flex: 1,
    gap: spacing.xxs,
  },
  profileText: {
    ...typography.rowTitle,
  },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  providerText: {
    fontSize: fontSizes.caption,
  },
});
