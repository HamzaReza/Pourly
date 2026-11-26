import { memo, useEffect, useRef, useSyncExternalStore, type ComponentRef } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  getMockPurchase,
  MOCK_PURCHASE_CHOICES,
  resolveMockPurchase,
  subscribeMockPurchase,
  type MockPurchaseChoice,
  type MockPurchaseRequest,
} from '@/services/iap.mock';

import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from './tokens';
import { Text } from '@/ui/Text';

/** Fixed test-tool colors: the sheet must never look like the real Google Play sheet. */
const SHEET_BACKGROUND = '#1B1B1B';
const SHEET_TEXT = '#FFFFFF';
const SHEET_MUTED = '#BBBBBB';
const SHEET_WARNING = '#FFD60A';
const SHEET_ON_WARNING = '#1B1B1B';
const SHEET_BUTTON = 'rgba(255,255,255,0.12)';
const BACKDROP = 'rgba(0,0,0,0.6)';

interface MockPurchaseSheetProps {
  request: MockPurchaseRequest;
}

/** The "TEST PURCHASE" sheet: the developer picks how the purchase ends. */
const MockPurchaseSheet = ({ request }: MockPurchaseSheetProps) => {
  const { t } = useTranslation();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, []);

  const choose = (choice: MockPurchaseChoice): void => resolveMockPurchase(choice);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => choose('cancel')}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal testID="mock-purchase-sheet">
          <View style={styles.label}>
            <Text ref={titleRef} accessibilityRole="header" style={styles.labelText}>
              {t('mockPurchase.title')}
            </Text>
          </View>
          <Text style={styles.product}>
            {t('mockPurchase.product', {
              name: t(`shop.names.${request.productId}`),
              price: request.priceString,
            })}
          </Text>
          <Text style={styles.message}>{t('mockPurchase.message')}</Text>
          {MOCK_PURCHASE_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={t(`mockPurchase.choices.${choice}`)}
              onPress={() => choose(choice)}
              style={({ pressed }) => [
                styles.choice,
                choice === 'succeed' && styles.primary,
                pressed && styles.pressed,
              ]}
              testID={`mock-purchase-${choice}`}
            >
              <Text style={[styles.choiceText, choice === 'succeed' && styles.primaryText]}>
                {t(`mockPurchase.choices.${choice}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};

/** Renders the mock store's purchase sheet while one is open (root layout). */
const MockPurchaseHostComponent = () => {
  const request = useSyncExternalStore(subscribeMockPurchase, getMockPurchase);
  return request === null ? null : <MockPurchaseSheet key={request.id} request={request} />;
};

export const MockPurchaseHost = memo(MockPurchaseHostComponent);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: BACKDROP,
  },
  sheet: {
    backgroundColor: SHEET_BACKGROUND,
    borderTopStartRadius: radii.xl,
    borderTopEndRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  label: {
    alignSelf: 'flex-start',
    backgroundColor: SHEET_WARNING,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  labelText: {
    color: SHEET_ON_WARNING,
    fontSize: fontSizes.small,
    fontWeight: fontWeights.heavy,
  },
  product: {
    color: SHEET_TEXT,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  message: {
    color: SHEET_MUTED,
    fontSize: fontSizes.small,
  },
  choice: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    backgroundColor: SHEET_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: SHEET_WARNING,
  },
  pressed: {
    opacity: 0.75,
  },
  choiceText: {
    color: SHEET_TEXT,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  primaryText: {
    color: SHEET_ON_WARNING,
  },
});
