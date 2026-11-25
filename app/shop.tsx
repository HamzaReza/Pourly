import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MANAGE_SUBSCRIPTIONS_URL, PRIVACY_URL, TERMS_URL } from '@/config/constants';
import type { RewardBundle } from '@/config/economy';
import { COIN_PACK_IDS, PRODUCTS, PRODUCT_IDS, type ProductId } from '@/config/products';
import { formatNumber } from '@/i18n/format';
import {
  buyProduct,
  loadStoreProducts,
  purchasesAvailable,
  restorePurchases,
} from '@/services/fulfillment';
import type { StoreProduct } from '@/services/iapTypes';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { CoinBadge, CoinGlyph } from '@/ui/CoinBadge';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';
import { Overlay } from '@/ui/Overlay';
import { Screen } from '@/ui/Screen';
import { SettingsSection } from '@/ui/settings/rows';
import { FreeCoinsCard } from '@/ui/shop/FreeCoinsCard';
import { PriceButton, type PriceState } from '@/ui/shop/PriceButton';
import { ProductRow } from '@/ui/shop/ProductRow';
import { StarterPackCard } from '@/ui/shop/StarterPackCard';
import { VipCard } from '@/ui/shop/VipCard';
import { useThemeUi } from '@/ui/theme';
import { showToast } from '@/ui/toastQueue';
import { fontSizes, fontWeights, radii, spacing } from '@/ui/tokens';
import { logger } from '@/utils/logger';

/** The store catalog as the Shop sees it. */
type Catalog =
  | { readonly kind: 'loading' }
  /** Purchases are switched off in this build. */
  | { readonly kind: 'unavailable' }
  /** The store could not be reached; the player can retry. */
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly products: ReadonlyMap<ProductId, StoreProduct> };

type ShopOverlay =
  | { readonly kind: 'thanks'; readonly reward: RewardBundle }
  | { readonly kind: 'alreadyOwned' }
  | null;

const openLink = (url: string): void => {
  Linking.openURL(url).catch((error: unknown) => {
    logger.warn('Could not open link', url, error);
    showToast('settings.linkFailed');
  });
};

const initialCatalog = (): Catalog =>
  purchasesAvailable() ? { kind: 'loading' } : { kind: 'unavailable' };

export default function ShopScreen() {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const noAds = useProgressStore((state) => state.entitlements.noAds);
  const vip = useProgressStore((state) => state.entitlements.vip);
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [overlay, setOverlay] = useState<ShopOverlay>(null);
  const mounted = useRef(true);

  /** Fetches products; the catalog must already show `loading`. */
  const fetchCatalog = useCallback(() => {
    if (!purchasesAvailable()) return;
    loadStoreProducts()
      .then((products) => {
        if (!mounted.current) return;
        setCatalog(
          products.length === 0
            ? { kind: 'failed' }
            : {
                kind: 'ready',
                products: new Map(products.map((product) => [product.id, product])),
              },
        );
      })
      .catch((error: unknown) => {
        logger.warn('Store products could not load', error);
        if (mounted.current) setCatalog({ kind: 'failed' });
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchCatalog();
    return () => {
      mounted.current = false;
    };
  }, [fetchCatalog]);

  const retry = useCallback(() => {
    setCatalog({ kind: 'loading' });
    fetchCatalog();
  }, [fetchCatalog]);

  const priceOf = (productId: ProductId, owned = false): PriceState => {
    if (owned) return { kind: 'owned' };
    if (catalog.kind === 'loading') return { kind: 'loading' };
    if (catalog.kind !== 'ready') return { kind: 'unavailable' };
    const product = catalog.products.get(productId);
    return product === undefined ? { kind: 'unavailable' } : { kind: 'ready', product };
  };

  const buy = useCallback((productId: ProductId) => {
    setBusy(true);
    buyProduct(productId)
      .then((result) => {
        if (!mounted.current) return;
        if (result.kind === 'granted') setOverlay({ kind: 'thanks', reward: result.reward });
        else if (result.kind === 'alreadyOwned') setOverlay({ kind: 'alreadyOwned' });
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  }, []);

  const restore = useCallback(() => {
    setOverlay(null);
    setRestoring(true);
    restorePurchases().finally(() => {
      if (mounted.current) setRestoring(false);
    });
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const manage = useCallback(() => openLink(MANAGE_SUBSCRIPTIONS_URL), []);
  const openTerms = useCallback(() => openLink(TERMS_URL), []);
  const openPrivacy = useCallback(() => openLink(PRIVACY_URL), []);

  const removeAdsName = t('shop.names.remove_ads');

  const shopOverlay =
    overlay === null ? null : overlay.kind === 'thanks' ? (
      <RewardOverlay
        ui={ui}
        title={t('shop.thanksTitle')}
        message={t('shop.thanksMessage')}
        reward={overlay.reward}
        onContinue={closeOverlay}
      />
    ) : (
      <Overlay
        title={t('shop.alreadyOwnedTitle')}
        message={t('shop.alreadyOwnedMessage')}
        onBackdropPress={closeOverlay}
        testID="shop-already-owned"
      >
        <Button
          variant="primary"
          label={t('shop.restoreAction')}
          onPress={restore}
          disabled={restoring}
          ui={ui}
        />
        <Button label={t('common.cancel')} onPress={closeOverlay} ui={ui} />
      </Overlay>
    );

  return (
    <Screen
      title={t('shop.title')}
      scroll
      headerEnd={<CoinBadge source="shop" interactive={false} />}
      overlay={shopOverlay}
    >
      {catalog.kind === 'unavailable' || catalog.kind === 'failed' ? (
        <View
          style={[styles.notice, { backgroundColor: ui.surface }]}
          accessibilityLiveRegion="polite"
          testID="shop-unavailable"
        >
          <Ionicons name="cloud-offline" size={24} color={ui.textMuted} />
          <View style={styles.noticeTexts}>
            <Text style={[styles.noticeTitle, { color: ui.text }]}>
              {t('shop.unavailableTitle')}
            </Text>
            <Text style={[styles.noticeText, { color: ui.textMuted }]}>
              {catalog.kind === 'failed' ? t('shop.loadFailed') : t('shop.unavailableMessage')}
            </Text>
          </View>
          {catalog.kind === 'failed' ? (
            <Button label={t('shop.retry')} onPress={retry} ui={ui} testID="shop-retry" />
          ) : null}
        </View>
      ) : null}
      <StarterPackCard
        ui={ui}
        price={priceOf(PRODUCT_IDS.starterPack)}
        disabled={busy}
        onBuy={() => buy(PRODUCT_IDS.starterPack)}
      />
      <SettingsSection ui={ui} title={t('shop.sections.coins')}>
        <FreeCoinsCard ui={ui} />
        {COIN_PACK_IDS.map((productId) => {
          const coins = PRODUCTS[productId].grant.coins ?? 0;
          const amount = t('shop.coinsAmount', { count: coins, value: formatNumber(coins) });
          return (
            <ProductRow
              key={productId}
              ui={ui}
              leading={<CoinGlyph size={26} />}
              title={amount}
              subtitle={t(`shop.names.${productId}`)}
              trailing={
                <PriceButton
                  ui={ui}
                  name={amount}
                  price={priceOf(productId)}
                  disabled={busy}
                  onBuy={() => buy(productId)}
                  testID={`buy-${productId}`}
                />
              }
              testID={`shop-${productId}`}
            />
          );
        })}
      </SettingsSection>
      <SettingsSection ui={ui} title={t('shop.sections.removeAds')}>
        <ProductRow
          ui={ui}
          leading={<Ionicons name="ban" size={26} color={ui.accent} />}
          title={removeAdsName}
          subtitle={t('shop.removeAds.description')}
          trailing={
            <PriceButton
              ui={ui}
              name={removeAdsName}
              price={priceOf(PRODUCT_IDS.removeAds, noAds)}
              disabled={busy}
              onBuy={() => buy(PRODUCT_IDS.removeAds)}
              testID="buy-remove_ads"
            />
          }
          testID="shop-remove_ads"
        />
      </SettingsSection>
      <VipCard
        ui={ui}
        active={vip}
        priceOf={priceOf}
        disabled={busy}
        onBuy={buy}
        onManage={manage}
        onTerms={openTerms}
        onPrivacy={openPrivacy}
      />
      <SettingsSection ui={ui} title={t('shop.sections.purchases')}>
        <View style={styles.purchases}>
          <Button
            label={t('shop.restore')}
            onPress={restore}
            disabled={restoring}
            icon="refresh"
            ui={ui}
            testID="shop-restore"
          />
          <Text style={[styles.note, { color: ui.textMuted }]}>{t('shop.restoreNote')}</Text>
          <Button
            label={t('shop.manage')}
            onPress={manage}
            icon="open-outline"
            ui={ui}
            testID="shop-manage"
          />
        </View>
      </SettingsSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  noticeTexts: {
    flex: 1,
    gap: spacing.xxs,
  },
  noticeTitle: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  noticeText: {
    fontSize: fontSizes.small,
  },
  purchases: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  note: {
    fontSize: fontSizes.small,
  },
});
