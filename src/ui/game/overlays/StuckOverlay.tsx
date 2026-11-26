import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CostDecision } from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { Button } from '@/ui/Button';
import { Overlay } from '@/ui/Overlay';
import { spacing } from '@/ui/tokens';

export interface StuckOverlayProps {
  ui: ThemeUi;
  canUndo: boolean;
  /** How the next +Tube would be paid (`unavailable` once the level's cap is reached). */
  tubeCost: CostDecision;
  /** An action is in progress (ad on screen). */
  busy: boolean;
  onUndo: () => void;
  onAddTube: () => void;
  onRestart: () => void;
  /** SKIP_LEVEL ad; omitted where skipping is not allowed (daily boards). */
  onSkip?: () => void;
  onClose: () => void;
}

interface TubeButtonProps {
  ui: ThemeUi;
  decision: CostDecision;
  busy: boolean;
  onPress: () => void;
}

/**
 * The +1 Tube action. Its label says how it will be paid: inventory, the level's ad, or coins.
 * Once the level's cap is reached it stays visible but disabled, with the reason as its label.
 */
const TubeButton = ({ ui, decision, busy, onPress }: TubeButtonProps) => {
  const { t } = useTranslation();
  switch (decision.kind) {
    case 'inventory':
      return (
        <Button
          variant="primary"
          label={t('stuck.tubeUse', { count: decision.owned })}
          onPress={onPress}
          ui={ui}
          testID="stuck-add-tube"
        />
      );
    case 'ad':
    case 'adOrShop':
      return (
        <Button
          variant="primary"
          label={t('stuck.tubeAd')}
          accessibilityLabel={t('stuck.tubeAdA11y')}
          onPress={onPress}
          disabled={busy}
          icon="play"
          ui={ui}
          testID="stuck-add-tube"
        />
      );
    case 'coins':
    case 'shop':
      return (
        <Button
          variant="primary"
          label={t('stuck.tubeCoins', { count: decision.cost })}
          onPress={onPress}
          ui={ui}
          testID="stuck-add-tube"
        />
      );
    case 'free':
    case 'unavailable':
      return (
        <Button
          label={t('stuck.tubeLimit')}
          onPress={onPress}
          disabled
          ui={ui}
          testID="stuck-add-tube"
        />
      );
  }
};

/**
 * "No moves" card: +1 Tube as the big primary action while the level's cap allows one (disabled
 * with the reason once it is reached), then Undo and Restart, Skip ▶ (SKIP_LEVEL ad, level mode).
 */
const StuckOverlayComponent = ({
  ui,
  canUndo,
  tubeCost,
  busy,
  onUndo,
  onAddTube,
  onRestart,
  onSkip,
  onClose,
}: StuckOverlayProps) => {
  const { t } = useTranslation();
  const tubeAvailable = tubeCost.kind !== 'unavailable';
  return (
    <Overlay
      title={t('stuck.title')}
      message={t(onSkip === undefined ? 'stuck.messageNoSkip' : 'stuck.message')}
      icon="hourglass-outline"
      testID="stuck-overlay"
    >
      {tubeAvailable ? (
        <TubeButton ui={ui} decision={tubeCost} busy={busy} onPress={onAddTube} />
      ) : null}
      <View style={styles.row}>
        {canUndo ? (
          <Button
            size="md"
            label={t('stuck.undo')}
            onPress={onUndo}
            ui={ui}
            style={styles.rowItem}
          />
        ) : null}
        <Button
          variant={tubeAvailable ? 'secondary' : 'primary'}
          size={tubeAvailable ? 'md' : 'lg'}
          label={t('stuck.restart')}
          onPress={onRestart}
          ui={ui}
          style={styles.rowItem}
        />
      </View>
      {tubeAvailable ? null : (
        <TubeButton ui={ui} decision={tubeCost} busy={busy} onPress={onAddTube} />
      )}
      {onSkip !== undefined ? (
        <Button
          size="md"
          label={t('stuck.skip')}
          accessibilityLabel={t('stuck.skipA11y')}
          onPress={onSkip}
          disabled={busy}
          icon="play"
          ui={ui}
        />
      ) : null}
      <Button variant="ghost" label={t('stuck.keepLooking')} onPress={onClose} ui={ui} />
    </Overlay>
  );
};

export const StuckOverlay = memo(StuckOverlayComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
});
