import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ECONOMY } from '@/config/economy';
import { freeCoinsStatus, type FreeCoinsStatus } from '@/game/freeCoins';
import { countdownParts } from '@/game/starterPack';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { localToday } from '@/state/gameFlow';
import { watchFreeCoinsAd } from '@/state/metaFlow';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { showToast } from '@/ui/toastQueue';

import { ProductRow } from './ProductRow';

const TICK_MS = 1000;

export interface FreeCoinsCardProps {
  ui: ThemeUi;
}

/**
 * "Free coins ▶": a FREE_COINS rewarded ad for `freeCoinsAdReward` coins, with the cooldown shown
 * as a live countdown and the daily cap. Only this row re-renders per second, and only during a
 * cooldown.
 */
const FreeCoinsCardComponent = ({ ui }: FreeCoinsCardProps) => {
  const { t } = useTranslation();
  const freeCoinsClaimsToday = useProgressStore((state) => state.ads.freeCoinsClaimsToday);
  const freeCoinsDate = useProgressStore((state) => state.ads.freeCoinsDate);
  const lastFreeCoinsAt = useProgressStore((state) => state.ads.lastFreeCoinsAt);
  const lastSeenAt = useProgressStore((state) => state.lastSeenAt);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const status: FreeCoinsStatus = freeCoinsStatus(
    { ads: { freeCoinsClaimsToday, freeCoinsDate, lastFreeCoinsAt }, lastSeenAt },
    localToday(now),
    now,
  );
  const coolingDown = status.kind === 'cooldown';

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [coolingDown]);

  const onWatch = (): void => {
    setBusy(true);
    watchFreeCoinsAd()
      .then((coins) => {
        if (coins > 0) {
          showToast('shop.freeCoins.granted', { count: coins, value: formatNumber(coins) });
        }
      })
      .finally(() => {
        setBusy(false);
        setNow(Date.now());
      });
  };

  const reward = ECONOMY.freeCoinsAdReward;
  let subtitle: string;
  let subtitleA11y: string | undefined;
  if (status.kind === 'ready') {
    subtitle = `${t('shop.freeCoins.reward', { count: reward, value: formatNumber(reward) })} · ${t(
      'shop.freeCoins.left',
      { count: status.remainingToday },
    )}`;
  } else if (status.kind === 'cooldown') {
    const { minutes, seconds } = countdownParts(status.remainingMs);
    subtitle = t('shop.freeCoins.cooldown', {
      time: t('shop.freeCoins.time', {
        m: formatNumber(minutes, 2),
        s: formatNumber(seconds, 2),
      }),
    });
    subtitleA11y = t('shop.freeCoins.cooldownA11y', {
      minutes: formatNumber(minutes),
      seconds: formatNumber(seconds),
    });
  } else {
    subtitle = t('shop.freeCoins.capped');
  }

  return (
    <ProductRow
      ui={ui}
      leading={<Ionicons name="play-circle" size={30} color={ui.accent} />}
      title={t('shop.freeCoins.title')}
      subtitle={subtitle}
      trailing={
        <Button
          variant="primary"
          label={t('shop.freeCoins.button')}
          accessibilityLabel={t('shop.freeCoins.a11y', {
            count: reward,
            value: formatNumber(reward),
          })}
          accessibilityHint={subtitleA11y ?? subtitle}
          icon="play"
          onPress={onWatch}
          disabled={busy || status.kind !== 'ready'}
          ui={ui}
          testID="free-coins-button"
        />
      }
      testID="free-coins"
    />
  );
};

export const FreeCoinsCard = memo(FreeCoinsCardComponent);
