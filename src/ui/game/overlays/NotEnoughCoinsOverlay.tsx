import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/i18n/format';

import type { PowerUp } from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';

interface CommonProps {
  ui: ThemeUi;
  cost: number;
  coins: number;
  busy: boolean;
  onShop: () => void;
  onClose: () => void;
}

/**
 * A power-up: the matching rewarded ad is offered next to the Shop. Without `onWatchAd` (the +Tube
 * after the level's one ad tube is used) only the Shop is offered.
 */
interface PowerUpProps extends CommonProps {
  powerUp: PowerUp;
  onWatchAd?: () => void;
}

/** Anything else bought with coins (a theme): only the Shop is offered. */
interface ItemProps extends CommonProps {
  /** Display name of the item, e.g. "The Neon theme". */
  itemName: string;
}

export type NotEnoughCoinsOverlayProps = PowerUpProps | ItemProps;

const ITEM_KEYS = {
  undo: 'items.undo',
  hint: 'items.hint',
  extraTube: 'items.extraTube',
} as const;

/**
 * Shown when coins do not cover a purchase: a power-up offers its rewarded ad (matching placement)
 * when it has one left, and the Shop; other items offer the Shop only.
 */
const NotEnoughCoinsOverlayComponent = (props: NotEnoughCoinsOverlayProps) => {
  const { ui, cost, coins, busy, onShop, onClose } = props;
  const { t } = useTranslation();
  const isPowerUp = 'powerUp' in props;
  const item = isPowerUp ? t(ITEM_KEYS[props.powerUp]) : props.itemName;
  const onWatchAd = isPowerUp ? props.onWatchAd : undefined;
  return (
    <Overlay
      title={t('notEnough.title')}
      message={t('notEnough.message', {
        item,
        count: cost,
        value: formatNumber(cost),
        balance: formatNumber(coins),
      })}
      onBackdropPress={onClose}
      icon="wallet-outline"
      iconTone="gold"
      testID="not-enough-overlay"
    >
      {onWatchAd !== undefined ? (
        <Button
          variant="primary"
          label={t('notEnough.watchAd')}
          accessibilityLabel={t('notEnough.watchAdA11y', { item: item.toLowerCase() })}
          onPress={onWatchAd}
          disabled={busy}
          icon="play"
          ui={ui}
        />
      ) : null}
      <Button
        variant={onWatchAd !== undefined ? 'secondary' : 'primary'}
        label={t('notEnough.shop')}
        onPress={onShop}
        ui={ui}
      />
      <Button variant="ghost" label={t('common.close')} onPress={onClose} ui={ui} />
    </Overlay>
  );
};

export const NotEnoughCoinsOverlay = memo(NotEnoughCoinsOverlayComponent);
