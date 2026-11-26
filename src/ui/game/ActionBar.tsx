import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  resolveExtraTubeCost,
  resolveHintCost,
  resolveUndoCost,
  type CostDecision,
} from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { isActive, selectTubeAdUnavailable, useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { CountBadge } from '@/ui/CountBadge';
import { surfaceColors } from '@/ui/theme';
import type { IconName } from '@/ui/IconButton';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';
import { Text } from '@/ui/Text';

export interface ActionBarProps {
  ui: ThemeUi;
  onUndo: () => void;
  onHint: () => void;
  onRestart: () => void;
  onAddTube: () => void;
}

interface ActionButtonProps {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
  decision: CostDecision | null;
  ui: ThemeUi;
}

/**
 * The badge for a cost decision: free/owned count, coin price, or the rewarded-ad icon. A +Tube
 * the player cannot afford (`shop`) still shows its coin price.
 */
const CostBadge = ({ decision, ui }: { decision: CostDecision | null; ui: ThemeUi }) => {
  if (decision === null) return null;
  switch (decision.kind) {
    case 'free':
      return <CountBadge ui={ui} count={decision.freeLeft} />;
    case 'inventory':
      return <CountBadge ui={ui} count={decision.owned} />;
    case 'coins':
    case 'shop':
      return <CountBadge ui={ui} count={decision.cost} coin />;
    case 'ad':
    case 'adOrShop':
      return <CountBadge ui={ui} icon="play" />;
    case 'unavailable':
      return null;
  }
};

const ActionButtonComponent = ({
  icon,
  label,
  accessibilityLabel,
  onPress,
  disabled,
  decision,
  ui,
}: ActionButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
  >
    <View
      style={[
        styles.icon,
        { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
      ]}
    >
      <Ionicons name={icon} size={22} color={ui.text} />
      <CostBadge decision={decision} ui={ui} />
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={[styles.label, { color: ui.textMuted }]}
    >
      {label}
    </Text>
  </Pressable>
);

const ActionButton = memo(ActionButtonComponent);

/**
 * Bottom action bar: Undo, Hint, Restart, +Tube. Each badge shows how the next use would be paid
 * (economy decisions), and the accessible label says the same in words.
 */
const ActionBarComponent = ({ ui, onUndo, onHint, onRestart, onAddTube }: ActionBarProps) => {
  const { t } = useTranslation();
  const live = useGameStore((state) => state.session !== null && isActive(state.session.status));
  const canUndo = useGameStore((state) => (state.session?.history.past.length ?? 0) > 0);
  const undosUsed = useGameStore((state) => state.session?.undosUsed ?? 0);
  const tubesAdded = useGameStore((state) => state.session?.extraTubesAdded ?? 0);
  const adTubeUsed = useGameStore((state) => state.session?.adTubeUsed ?? false);
  /** The level's free ad could not be shown: the +Tube is offered for coins instead. */
  const tubeAdUnavailable = useGameStore(selectTubeAdUnavailable);
  const hintShown = useGameStore((state) => state.hint !== null);
  const coins = useProgressStore((state) => state.coins);
  const undos = useProgressStore((state) => state.undos);
  const hints = useProgressStore((state) => state.hints);
  const extraTubes = useProgressStore((state) => state.extraTubes);

  const undoCost = resolveUndoCost({ undosUsed, inventory: undos, coins });
  const hintCost = resolveHintCost({ inventory: hints, coins });
  const tubeCost = resolveExtraTubeCost({
    tubesAdded,
    adTubeUsed: adTubeUsed || tubeAdUnavailable,
    inventory: extraTubes,
    coins,
  });

  const describe = (decision: CostDecision): string => {
    switch (decision.kind) {
      case 'free':
        return t('game.costFree', { count: decision.freeLeft });
      case 'inventory':
        return t('game.costOwned', { count: decision.owned });
      case 'coins':
      case 'shop':
        return t('game.costCoins', { count: decision.cost });
      case 'ad':
      case 'adOrShop':
        return t('game.costAd');
      case 'unavailable':
        return t('game.costUsed');
    }
  };
  const a11y = (action: string, decision: CostDecision): string =>
    t('game.actionA11y', { action, detail: describe(decision) });

  return (
    <View style={styles.bar}>
      <ActionButton
        icon="arrow-undo-outline"
        label={t('game.undo')}
        accessibilityLabel={a11y(t('game.undo'), undoCost)}
        onPress={onUndo}
        disabled={!live || !canUndo}
        decision={undoCost}
        ui={ui}
      />
      <ActionButton
        icon="bulb-outline"
        label={t('game.hint')}
        accessibilityLabel={a11y(t('game.hint'), hintCost)}
        onPress={onHint}
        disabled={!live || hintShown}
        decision={hintCost}
        ui={ui}
      />
      <ActionButton
        icon="refresh"
        label={t('game.restart')}
        accessibilityLabel={t('game.restart')}
        onPress={onRestart}
        disabled={!live}
        decision={null}
        ui={ui}
      />
      <ActionButton
        icon="add-circle-outline"
        label={t('game.addTube')}
        accessibilityLabel={
          tubeCost.kind === 'unavailable'
            ? t('game.actionA11y', { action: t('game.addTube'), detail: t('game.costTubeLimit') })
            : a11y(t('game.addTube'), tubeCost)
        }
        onPress={onAddTube}
        disabled={!live || tubeCost.kind === 'unavailable'}
        decision={tubeCost}
        ui={ui}
      />
    </View>
  );
};

export const ActionBar = memo(ActionBarComponent);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  action: {
    minWidth: 64,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
});
