import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { PowerUp } from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';

export interface NotEnoughCoinsOverlayProps {
  ui: ThemeUi;
  powerUp: PowerUp;
  cost: number;
  coins: number;
  busy: boolean;
  onWatchAd: () => void;
  onShop: () => void;
  onClose: () => void;
}

const ITEM_KEYS = {
  undo: 'items.undo',
  hint: 'items.hint',
  extraTube: 'items.extraTube',
} as const;

/** Offers a rewarded ad (matching placement) or the Shop when coins do not cover a power-up. */
const NotEnoughCoinsOverlayComponent = ({
  ui,
  powerUp,
  cost,
  coins,
  busy,
  onWatchAd,
  onShop,
  onClose,
}: NotEnoughCoinsOverlayProps) => {
  const { t } = useTranslation();
  const item = t(ITEM_KEYS[powerUp]);
  return (
    <Overlay
      title={t('notEnough.title')}
      message={t('notEnough.message', { item, cost, coins })}
      onBackdropPress={onClose}
      testID="not-enough-overlay"
    >
      <Button
        variant="primary"
        label={t('notEnough.watchAd')}
        accessibilityLabel={t('notEnough.watchAdA11y', { item: item.toLowerCase() })}
        onPress={onWatchAd}
        disabled={busy}
        icon="play"
        ui={ui}
      />
      <Button label={t('notEnough.shop')} onPress={onShop} ui={ui} />
      <Button label={t('common.close')} onPress={onClose} ui={ui} />
    </Overlay>
  );
};

export const NotEnoughCoinsOverlay = memo(NotEnoughCoinsOverlayComponent);
