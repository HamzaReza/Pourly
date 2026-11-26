import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';

export interface NotificationPromptOverlayProps {
  ui: ThemeUi;
  /** Disables both buttons while the system prompt is open. */
  busy: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

/**
 * The notification soft-prompt (spec §10.2, §14): explains the daily challenge and streak
 * reminders before Android's own permission prompt, which only "Allow" opens. The backdrop and
 * hardware back count as "Not now".
 */
const NotificationPromptOverlayComponent = ({
  ui,
  busy,
  onAllow,
  onNotNow,
}: NotificationPromptOverlayProps) => {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t('notificationPrompt.title')}
      message={t('notificationPrompt.message')}
      onClose={busy ? undefined : onNotNow}
      icon="notifications-outline"
      testID="notification-prompt"
    >
      <Button
        variant="primary"
        label={t('notificationPrompt.allow')}
        accessibilityLabel={t('notificationPrompt.allowA11y')}
        onPress={onAllow}
        disabled={busy}
        ui={ui}
        testID="notification-allow"
      />
      <Button
        variant="ghost"
        label={t('notificationPrompt.notNow')}
        accessibilityLabel={t('notificationPrompt.notNowA11y')}
        onPress={onNotNow}
        disabled={busy}
        ui={ui}
        testID="notification-not-now"
      />
    </Sheet>
  );
};

export const NotificationPromptOverlay = memo(NotificationPromptOverlayComponent);
