import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  resolveExtraTubeCost,
  resolveHintCost,
  resolveUndoCost,
  type CostDecision,
} from '@/game/economy';
import type { ThemeUi } from '@/render/themes';
import { isActive, useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { CountBadge } from '@/ui/CountBadge';
import type { IconName } from '@/ui/IconButton';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

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

/** The badge for a cost decision: free/owned count, coin price, or the rewarded-ad icon. */
const CostBadge = ({ decision }: { decision: CostDecision | null }) => {
  if (decision === null) return null;
  switch (decision.kind) {
    case 'free':
      return <CountBadge count={decision.freeLeft} />;
    case 'inventory':
      return <CountBadge count={decision.owned} />;
    case 'coins':
      return <CountBadge count={decision.cost} coin />;
    case 'adOrShop':
      return <CountBadge icon="play" />;
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
    <View style={[styles.icon, { backgroundColor: ui.surface }]}>
      <Ionicons name={icon} size={24} color={ui.text} />
      <CostBadge decision={decision} />
    </View>
    <Text numberOfLines={1} style={[styles.label, { color: ui.text }]}>
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
  const extraTubeUsed = useGameStore((state) => state.session?.extraTubeUsed ?? false);
  const hintShown = useGameStore((state) => state.hint !== null);
  const coins = useProgressStore((state) => state.coins);
  const undos = useProgressStore((state) => state.undos);
  const hints = useProgressStore((state) => state.hints);
  const extraTubes = useProgressStore((state) => state.extraTubes);

  const undoCost = resolveUndoCost({ undosUsed, inventory: undos, coins });
  const hintCost = resolveHintCost({ inventory: hints, coins });
  const tubeCost = resolveExtraTubeCost({ extraTubeUsed, inventory: extraTubes, coins });

  const describe = (decision: CostDecision): string => {
    switch (decision.kind) {
      case 'free':
        return t('game.costFree', { count: decision.freeLeft });
      case 'inventory':
        return t('game.costOwned', { count: decision.owned });
      case 'coins':
        return t('game.costCoins', { count: decision.cost });
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
        icon="arrow-undo"
        label={t('game.undo')}
        accessibilityLabel={a11y(t('game.undo'), undoCost)}
        onPress={onUndo}
        disabled={!live || !canUndo}
        decision={undoCost}
        ui={ui}
      />
      <ActionButton
        icon="bulb"
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
        icon="add-circle"
        label={t('game.addTube')}
        accessibilityLabel={a11y(t('game.addTube'), tubeCost)}
        onPress={onAddTube}
        disabled={!live || extraTubeUsed}
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
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
});
