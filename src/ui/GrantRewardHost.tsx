import { memo, useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import {
  currentGrantNotice,
  dismissGrantNotice,
  subscribeGrantNotices,
} from '@/services/grantNotices';
import { RewardOverlay } from '@/ui/game/overlays/RewardOverlay';

import { useThemeUi } from './theme';

/**
 * Shows a purchase that arrived from the server (signed-in players) with the Reward overlay, one
 * at a time, above whatever screen is open. Mounted once in the root layout.
 */
const GrantRewardHostComponent = () => {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const notice = useSyncExternalStore(subscribeGrantNotices, currentGrantNotice);
  const id = notice?.id;
  const onContinue = useCallback(() => {
    if (id !== undefined) dismissGrantNotice(id);
  }, [id]);

  if (notice === null) return null;
  return (
    <RewardOverlay
      key={notice.id}
      ui={ui}
      title={t('cloud.grantTitle')}
      message={t('cloud.grantMessage')}
      reward={notice.reward}
      onContinue={onContinue}
    />
  );
};

export const GrantRewardHost = memo(GrantRewardHostComponent);
