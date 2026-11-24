import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';
import { spacing } from '@/ui/tokens';

export interface StuckOverlayProps {
  ui: ThemeUi;
  canUndo: boolean;
  canAddTube: boolean;
  /** An action is in progress (ad on screen). */
  busy: boolean;
  onUndo: () => void;
  onAddTube: () => void;
  onRestart: () => void;
  /** SKIP_LEVEL ad; omitted where skipping is not allowed (daily boards). */
  onSkip?: () => void;
  onClose: () => void;
}

/** "No moves" card: Undo, +Tube (if unused), Restart, Skip ▶ (SKIP_LEVEL ad, level mode). */
const StuckOverlayComponent = ({
  ui,
  canUndo,
  canAddTube,
  busy,
  onUndo,
  onAddTube,
  onRestart,
  onSkip,
  onClose,
}: StuckOverlayProps) => {
  const { t } = useTranslation();
  return (
    <Overlay
      title={t('stuck.title')}
      message={t(onSkip === undefined ? 'stuck.messageNoSkip' : 'stuck.message')}
      testID="stuck-overlay"
    >
      <View style={styles.row}>
        {canUndo ? (
          <Button label={t('stuck.undo')} onPress={onUndo} ui={ui} style={styles.rowItem} />
        ) : null}
        {canAddTube ? (
          <Button label={t('stuck.addTube')} onPress={onAddTube} ui={ui} style={styles.rowItem} />
        ) : null}
      </View>
      <Button variant="primary" label={t('stuck.restart')} onPress={onRestart} ui={ui} />
      {onSkip !== undefined ? (
        <Button
          label={t('stuck.skip')}
          accessibilityLabel={t('stuck.skipA11y')}
          onPress={onSkip}
          disabled={busy}
          icon="play"
          ui={ui}
        />
      ) : null}
      <Button label={t('stuck.keepLooking')} onPress={onClose} ui={ui} />
    </Overlay>
  );
};

export const StuckOverlay = memo(StuckOverlayComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
});
