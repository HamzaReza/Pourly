import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { signInWithGoogle, useAuthStore } from '@/services/auth';
import { useCloudStore, type SignInCardDismissal } from '@/state/cloudStore';
import { hasAnyPurchase, useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { surfaceColors } from '@/ui/theme';
import { radii, spacing, typography } from '@/ui/tokens';
import { Text } from '@/ui/Text';

/** The card appears once level 5 is completed (the next level is 6) or after a first purchase. */
export const SIGN_IN_CARD_LEVEL = 6;

export interface SignInCardInput {
  readonly available: boolean;
  readonly guest: boolean;
  readonly level: number;
  readonly hasPurchase: boolean;
  readonly dismissal: SignInCardDismissal;
}

/**
 * Whether Home suggests signing in (pure). Only guests in builds with cloud features. A dismissal
 * made before any purchase lasts until the first purchase; one made after a purchase is final.
 */
export const shouldShowSignInCard = ({
  available,
  guest,
  level,
  hasPurchase,
  dismissal,
}: SignInCardInput): boolean => {
  if (!available || !guest) return false;
  if (level < SIGN_IN_CARD_LEVEL && !hasPurchase) return false;
  if (dismissal === 'afterPurchase') return false;
  return dismissal === 'none' || hasPurchase;
};

export interface SignInCardProps {
  ui: ThemeUi;
}

/** Home: "Sign in to save your progress" with Sign in and a dismiss button. */
const SignInCardComponent = ({ ui }: SignInCardProps) => {
  const { t } = useTranslation();
  const available = useAuthStore((state) => state.available);
  const guest = useAuthStore((state) => state.status === 'guest');
  const busy = useAuthStore((state) => state.pending !== null);
  const level = useProgressStore((state) => state.level);
  const hasPurchase = useProgressStore(hasAnyPurchase);
  const dismissal = useCloudStore((state) => state.signInCardDismissal);

  const onDismiss = useCallback(
    () => useCloudStore.getState().dismissSignInCard(hasPurchase),
    [hasPurchase],
  );
  const onSignIn = useCallback(() => {
    void signInWithGoogle();
  }, []);

  if (!shouldShowSignInCard({ available, guest, level, hasPurchase, dismissal })) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
      ]}
      testID="sign-in-card"
    >
      <View style={[styles.iconTile, { backgroundColor: surfaceColors(ui).accentTint }]}>
        <Ionicons name="cloud-upload-outline" size={20} color={ui.accent} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: ui.text }]}>{t('home.signInCard.title')}</Text>
        <Text style={[styles.body, { color: ui.textMuted }]}>{t('home.signInCard.body')}</Text>
        <Button
          variant="primary"
          size="sm"
          label={t('home.signInCard.button')}
          accessibilityLabel={t('account.signIn')}
          onPress={onSignIn}
          disabled={busy}
          ui={ui}
          style={styles.button}
        />
      </View>
      <IconButton
        icon="close"
        accessibilityLabel={t('home.signInCard.dismissA11y')}
        onPress={onDismiss}
        color={ui.textMuted}
      />
    </View>
  );
};

export const SignInCard = memo(SignInCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingStart: spacing.md,
    paddingEnd: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.rowTitleStrong,
  },
  body: {
    ...typography.rowHint,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
});
