import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RewardBundle } from '@/config/economy';
import type { ThemeUi } from '@/render/themes';
import { AnimatedCount } from '@/ui/AnimatedCount';
import { Button } from '@/ui/Button';
import { CoinGlyph } from '@/ui/CoinBadge';
import { Overlay } from '@/ui/Overlay';
import { useReducedMotionPref } from '@/ui/theme';
import { fontSizes, fontWeights, spacing } from '@/ui/tokens';

export interface RewardOverlayProps {
  ui: ThemeUi;
  title: string;
  message?: string;
  /** Granted items; coins count up, other items are listed. */
  reward: RewardBundle;
  onContinue: () => void;
}

const ITEM_LINES = [
  ['hints', 'reward.hints'],
  ['undos', 'reward.undos'],
  ['extraTubes', 'reward.extraTubes'],
] as const;

/** Generic reward card: shown after rewarded grants and after a skipped level. */
const RewardOverlayComponent = ({ ui, title, message, reward, onContinue }: RewardOverlayProps) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const coins = reward.coins ?? 0;
  return (
    <Overlay title={title} message={message} testID="reward-overlay">
      {coins > 0 ? (
        <View
          accessible
          accessibilityLabel={t('reward.coins', { count: coins })}
          style={styles.line}
        >
          <CoinGlyph size={24} />
          <AnimatedCount
            value={coins}
            from={0}
            prefix="+"
            reducedMotion={reducedMotion}
            style={[styles.amount, { color: ui.text }]}
          />
        </View>
      ) : null}
      {ITEM_LINES.map(([field, key]) => {
        const amount = reward[field] ?? 0;
        if (amount <= 0) return null;
        return (
          <Text key={field} style={[styles.item, { color: ui.text }]}>
            {t(key, { count: amount })}
          </Text>
        );
      })}
      <Button variant="primary" label={t('common.continue')} onPress={onContinue} ui={ui} />
    </Overlay>
  );
};

export const RewardOverlay = memo(RewardOverlayComponent);

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amount: {
    minWidth: 56,
    fontSize: fontSizes.heading,
    fontWeight: fontWeights.heavy,
  },
  item: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
});
