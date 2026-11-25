import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { signInWithGoogle, signOut, useAuthStore } from '@/services/auth';

import { InfoRow, LinkRow, SettingsSection } from './rows';

export interface AccountSectionProps {
  ui: ThemeUi;
  /** Opens the two-step "Delete account and data" confirmation. */
  onDelete: () => void;
}

/**
 * Settings → Account: "Sign in with Google" for guests, the account email with Sign out and
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
      {!available ? (
        <InfoRow ui={ui} text={t('account.unavailable')} />
      ) : status === 'guest' ? (
        <LinkRow
          ui={ui}
          icon="logo-google"
          label={t('account.signIn')}
          hint={busy ? t('account.working') : t('account.signInHint')}
          disabled={busy}
          onPress={onSignIn}
          testID="setting-sign-in"
        />
      ) : (
        <>
          <InfoRow
            ui={ui}
            text={email === null ? t('account.signedIn') : t('account.signedInAs', { email })}
          />
          <LinkRow
            ui={ui}
            icon="log-out"
            label={t('account.signOut')}
            hint={pending === 'signOut' ? t('account.working') : t('account.signOutHint')}
            disabled={busy}
            onPress={onSignOut}
            testID="setting-sign-out"
          />
          <LinkRow
            ui={ui}
            icon="trash"
            label={t('account.delete')}
            hint={pending === 'delete' ? t('account.working') : t('account.deleteHint')}
            disabled={busy}
            onPress={onDelete}
            testID="setting-delete-account"
          />
        </>
      )}
    </SettingsSection>
  );
};

export const AccountSection = memo(AccountSectionComponent);
