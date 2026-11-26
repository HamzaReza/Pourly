import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';

export interface RestartConfirmOverlayProps {
  ui: ThemeUi;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asked only when a paid resource was used this attempt (spec §6). */
const RestartConfirmOverlayComponent = ({
  ui,
  onConfirm,
  onCancel,
}: RestartConfirmOverlayProps) => {
  const { t } = useTranslation();
  return (
    <Overlay
      title={t('restartConfirm.title')}
      message={t('restartConfirm.message')}
      onBackdropPress={onCancel}
      icon="refresh"
      testID="restart-confirm-overlay"
    >
      <Button variant="primary" label={t('restartConfirm.cancel')} onPress={onCancel} ui={ui} />
      <Button label={t('restartConfirm.confirm')} onPress={onConfirm} ui={ui} />
    </Overlay>
  );
};

export const RestartConfirmOverlay = memo(RestartConfirmOverlayComponent);
