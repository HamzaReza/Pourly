import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';

/** What the +Tube would cost: one inventory +Tube (of `owned`) or `cost` coins. */
export type TubePayment =
  | { readonly kind: 'inventory'; readonly owned: number }
  | { readonly kind: 'coins'; readonly cost: number };

export interface TubeConfirmOverlayProps {
  ui: ThemeUi;
  payment: TubePayment;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asked before an inventory +Tube or coins are spent on an extra tube (the ad path needs none:
 * watching the ad is the confirmation).
 */
const TubeConfirmOverlayComponent = ({
  ui,
  payment,
  onConfirm,
  onCancel,
}: TubeConfirmOverlayProps) => {
  const { t } = useTranslation();
  const inventory = payment.kind === 'inventory';
  return (
    <Overlay
      title={
        inventory ? t('tubeConfirm.useTitle') : t('tubeConfirm.buyTitle', { count: payment.cost })
      }
      message={
        inventory
          ? t('tubeConfirm.useMessage', { count: payment.owned })
          : t('tubeConfirm.buyMessage')
      }
      onBackdropPress={onCancel}
      icon={inventory ? 'add-circle-outline' : 'wallet-outline'}
      iconTone={inventory ? 'accent' : 'gold'}
      testID="tube-confirm-overlay"
    >
      <Button
        variant="primary"
        label={t(inventory ? 'tubeConfirm.useConfirm' : 'tubeConfirm.buyConfirm')}
        onPress={onConfirm}
        ui={ui}
      />
      <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} ui={ui} />
    </Overlay>
  );
};

export const TubeConfirmOverlay = memo(TubeConfirmOverlayComponent);
