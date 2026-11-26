import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { themeStatus, type ThemeStatus } from '@/game/themeUnlocks';
import { formatNumber } from '@/i18n/format';
import { THEME_IDS, THEMES, type ThemeId, type ThemeUi } from '@/render/themes';
import { track } from '@/services/analytics';
import { unlockThemeWithCoins } from '@/state/metaFlow';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { CoinBadge, CoinGlyph } from '@/ui/CoinBadge';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { Overlay } from '@/ui/Overlay';
import { Screen } from '@/ui/Screen';
import { surfaceColors, useActiveThemeId, useThemeUi } from '@/ui/theme';
import { ThemePreview } from '@/ui/themes/ThemePreview';
import { showToast } from '@/ui/Toast';
import { controlHeights, radii, spacing, typography, withAlpha } from '@/ui/tokens';
import { Text } from '@/ui/Text';

const COLUMNS = 2;
const PREVIEW_RATIO = 0.62;
const CARD_BORDER = 1.5;

type Modal =
  | { readonly kind: 'confirm'; readonly themeId: ThemeId; readonly price: number }
  | { readonly kind: 'notEnough'; readonly themeId: ThemeId; readonly price: number }
  | null;

const openShop = (from: string): void => {
  track('shop_opened', { from });
  router.push('/shop');
};

interface ThemeCardProps {
  ui: ThemeUi;
  themeId: ThemeId;
  status: ThemeStatus;
  active: boolean;
  width: number;
  onApply: (themeId: ThemeId) => void;
  onUnlock: (themeId: ThemeId, price: number) => void;
}

const ThemeCardComponent = ({
  ui,
  themeId,
  status,
  active,
  width,
  onApply,
  onUnlock,
}: ThemeCardProps) => {
  const { t } = useTranslation();
  const name = t(`themes.names.${themeId}`);
  const previewWidth = width - CARD_BORDER * 2;
  const previewHeight = Math.round(previewWidth * PREVIEW_RATIO);

  const action = (() => {
    switch (status.kind) {
      case 'owned':
        return active ? (
          <View
            accessible
            accessibilityLabel={t('themes.inUseA11y', { name })}
            style={styles.inUse}
          >
            <Ionicons name="checkmark-circle" size={16} color={ui.accent} />
            <Text style={[styles.inUseText, { color: ui.text }]}>{t('themes.inUse')}</Text>
          </View>
        ) : (
          <Button
            variant="primary"
            size="sm"
            label={t('themes.apply')}
            accessibilityLabel={t('themes.applyA11y', { name })}
            onPress={() => onApply(themeId)}
            ui={ui}
          />
        );
      case 'coins':
        return (
          <Button
            size="sm"
            label={formatNumber(status.price)}
            accessibilityLabel={t('themes.unlockA11y', { name, price: formatNumber(status.price) })}
            onPress={() => onUnlock(themeId, status.price)}
            leading={<CoinGlyph />}
            ui={ui}
          />
        );
      case 'starterPack':
        return (
          <Button
            size="sm"
            label={t('themes.starterPack')}
            accessibilityLabel={t('themes.starterPackA11y', { name })}
            onPress={() => openShop('themes_starter_pack')}
            icon="gift"
            ui={ui}
          />
        );
      case 'vip':
        return (
          <Button
            size="sm"
            label={t('themes.vip')}
            accessibilityLabel={t('themes.vipA11y', { name })}
            onPress={() => openShop('themes_vip')}
            icon="diamond"
            ui={ui}
          />
        );
    }
  })();

  return (
    <View
      style={[
        styles.card,
        {
          width,
          backgroundColor: ui.surface,
          borderColor: active ? ui.accent : surfaceColors(ui).hairline,
        },
      ]}
      testID={`theme-card-${themeId}`}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('themes.previewA11y', { name })}
        style={[styles.preview, { height: previewHeight }]}
      >
        <ThemePreview theme={THEMES[themeId]} width={previewWidth} height={previewHeight} />
        {status.kind !== 'owned' ? (
          <View style={[styles.lock, { backgroundColor: withAlpha(ui.surface, 0.85) }]}>
            <Ionicons name="lock-closed" size={12} color={ui.text} />
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: ui.text }]} numberOfLines={1}>
          {name}
        </Text>
        {action}
      </View>
    </View>
  );
};

const ThemeCard = memo(ThemeCardComponent);

export default function ThemesScreen() {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const { width: windowWidth } = useWindowDimensions();
  const activeId = useActiveThemeId();
  const ownedThemes = useProgressStore((state) => state.ownedThemes);
  const vip = useProgressStore((state) => state.entitlements.vip);
  const starterPackPurchased = useProgressStore((state) => state.starterPackPurchased);
  const coins = useProgressStore((state) => state.coins);
  const [modal, setModal] = useState<Modal>(null);

  const cardWidth = Math.floor(
    (Math.min(windowWidth, 560) - spacing.lg * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS,
  );
  const owner = { ownedThemes, entitlements: { noAds: false, vip }, starterPackPurchased };

  const onApply = useCallback((themeId: ThemeId) => {
    useProgressStore.getState().setActiveTheme(themeId);
  }, []);

  const onUnlock = useCallback((themeId: ThemeId, price: number) => {
    const enough = useProgressStore.getState().coins >= price;
    setModal({ kind: enough ? 'confirm' : 'notEnough', themeId, price });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const confirmUnlock = useCallback(() => {
    if (modal?.kind !== 'confirm') return;
    const result = unlockThemeWithCoins(modal.themeId);
    if (result.kind === 'unlocked') {
      setModal(null);
      showToast('themes.unlocked', { name: t(`themes.names.${modal.themeId}`) });
    } else if (result.kind === 'notEnoughCoins') {
      setModal({ kind: 'notEnough', themeId: modal.themeId, price: result.price });
    } else {
      setModal(null);
    }
  }, [modal, t]);

  const toShop = useCallback(() => {
    setModal(null);
    openShop('themes_not_enough');
  }, []);

  const modalName = modal === null ? '' : t(`themes.names.${modal.themeId}`);
  const overlay =
    modal?.kind === 'confirm' ? (
      <Overlay
        title={t('themes.confirmTitle', { name: modalName })}
        message={t('themes.confirmMessage', {
          name: modalName,
          price: formatNumber(modal.price),
          coins: formatNumber(coins),
        })}
        onBackdropPress={closeModal}
        icon="color-palette-outline"
        testID="theme-confirm"
      >
        <Button variant="primary" label={t('themes.confirm')} onPress={confirmUnlock} ui={ui} />
        <Button variant="ghost" label={t('common.notNow')} onPress={closeModal} ui={ui} />
      </Overlay>
    ) : modal?.kind === 'notEnough' ? (
      <NotEnoughCoinsOverlay
        ui={ui}
        itemName={t('themes.item', { name: modalName })}
        cost={modal.price}
        coins={coins}
        busy={false}
        onShop={toShop}
        onClose={closeModal}
      />
    ) : null;

  return (
    <Screen
      title={t('themes.title')}
      headerEnd={<CoinBadge source="themes" />}
      scroll
      overlay={overlay}
    >
      <View style={styles.grid}>
        {THEME_IDS.map((themeId) => (
          <ThemeCard
            key={themeId}
            ui={ui}
            themeId={themeId}
            status={themeStatus(themeId, owner)}
            active={themeId === activeId}
            width={cardWidth}
            onApply={onApply}
            onUnlock={onUnlock}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.card,
    borderWidth: CARD_BORDER,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
  },
  lock: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  name: {
    ...typography.rowTitleStrong,
    textAlign: 'center',
  },
  inUse: {
    minHeight: controlHeights.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  inUseText: {
    ...typography.control,
  },
});
