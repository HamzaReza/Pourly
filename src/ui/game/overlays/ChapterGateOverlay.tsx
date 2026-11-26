import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { gateOf } from '@/game/chapters';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { reportGateShown, unlockChapterWithCoins } from '@/state/chapterFlow';
import { useProgressStore } from '@/state/progressStore';
import { ECONOMY } from '@/config/economy';
import { Button } from '@/ui/Button';
import { Tag } from '@/ui/Tag';
import { CoinGlyph } from '@/ui/CoinBadge';
import { withGoldStars } from '@/ui/goldStars';
import { NotEnoughCoinsOverlay } from '@/ui/game/overlays/NotEnoughCoinsOverlay';
import { Overlay } from '@/ui/Overlay';
import { Text } from '@/ui/Text';
import { surfaceColors } from '@/ui/theme';
import { showToast } from '@/ui/toastQueue';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/ui/tokens';

export interface ChapterGateOverlayProps {
  ui: ThemeUi;
  /** The locked chapter. */
  chapter: number;
  /** "Replay levels": open the Levels screen on `previousChapter`. */
  onReplay: (previousChapter: number) => void;
  /** The chapter is open (bought now, or already open by stars): continue. */
  onUnlocked: () => void;
  /** "Not now" or the backdrop. */
  onClose: () => void;
  /** Not enough coins → Shop. */
  onShop: () => void;
}

type Step = 'gate' | 'confirm' | 'notEnough';

/**
 * The chapter gate (P12.7): what is missing (stars in the previous chapter, with a progress bar)
 * and the two ways in: replaying levels for stars, or coins after a confirmation (the
 * Not-enough-coins flow when short). Reports `chapter_gate_shown` once per opening.
 */
const ChapterGateOverlayComponent = ({
  ui,
  chapter,
  onReplay,
  onUnlocked,
  onClose,
  onShop,
}: ChapterGateOverlayProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('gate');
  const coins = useProgressStore((state) => state.coins);
  const stars = useProgressStore((state) => state.stars);
  const paidChapters = useProgressStore((state) => state.paidChapters);
  const vip = useProgressStore((state) => state.entitlements.vip);
  const gate = gateOf({ stars, paidChapters, entitlements: { vip } }, chapter);
  const reported = useRef(false);

  useEffect(() => {
    if (gate !== null && !reported.current) {
      reported.current = true;
      reportGateShown(gate);
    }
  }, [gate]);

  // Open now (just bought, or stars from a replay or a cloud merge): nothing left to gate.
  useEffect(() => {
    if (gate === null) onUnlocked();
  }, [gate, onUnlocked]);

  if (gate === null) return null;
  const previous = chapter - 1;
  const n = formatNumber(chapter);
  const price = formatNumber(gate.price);

  const onUnlockPressed = (): void => {
    setStep(coins >= gate.price ? 'confirm' : 'notEnough');
  };

  const confirm = (): void => {
    const result = unlockChapterWithCoins(chapter);
    if (result.kind === 'notEnoughCoins') {
      setStep('notEnough');
      return;
    }
    if (result.kind === 'unlocked') showToast('chapters.unlocked', { n });
    // The gate is now null: the effect above calls `onUnlocked`.
  };

  if (step === 'notEnough') {
    return (
      <NotEnoughCoinsOverlay
        ui={ui}
        itemName={t('chapters.item', { n })}
        cost={gate.price}
        coins={coins}
        busy={false}
        onShop={onShop}
        onClose={() => setStep('gate')}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <Overlay
        title={t('chapters.confirmTitle', { count: gate.price, value: price, n })}
        message={t('chapters.confirmMessage')}
        onBackdropPress={() => setStep('gate')}
        icon="lock-open-outline"
        iconTone="gold"
        testID="chapter-unlock-confirm"
      >
        <Button
          variant="primary"
          label={t('chapters.confirm')}
          onPress={confirm}
          ui={ui}
          testID="chapter-unlock-confirm-button"
        />
        <Button
          variant="ghost"
          label={t('common.cancel')}
          onPress={() => setStep('gate')}
          ui={ui}
        />
      </Overlay>
    );
  }

  const progress = gate.target > 0 ? Math.min(1, gate.stars / gate.target) : 0;
  /** Short on coins: the unlock still opens Not-enough-coins, but looks secondary. */
  const affordable = coins >= gate.price;
  return (
    <Overlay
      title={t('chapters.gateTitle', { n })}
      message={withGoldStars(
        t('chapters.gateMessage', {
          target: formatNumber(gate.target),
          prev: formatNumber(previous),
        }),
      )}
      onBackdropPress={onClose}
      icon="lock-closed"
      testID="chapter-gate"
    >
      <View
        accessible
        accessibilityLabel={t('chapters.progressA11y', {
          stars: formatNumber(gate.stars),
          target: formatNumber(gate.target),
          prev: formatNumber(previous),
        })}
        style={styles.progress}
        testID="chapter-gate-progress"
      >
        <Text style={[styles.progressText, { color: ui.text }]}>
          {withGoldStars(
            t('chapters.progress', {
              stars: formatNumber(gate.stars),
              target: formatNumber(gate.target),
            }),
          )}
        </Text>
        <View style={[styles.bar, { backgroundColor: surfaceColors(ui).track }]}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.star },
            ]}
          />
        </View>
      </View>
      <Button
        variant="primary"
        label={t('chapters.replay')}
        onPress={() => onReplay(previous)}
        ui={ui}
        testID="chapter-gate-replay"
      />
      <Button
        size="md"
        label={t('chapters.unlockCoins', { count: gate.price, value: price })}
        onPress={onUnlockPressed}
        leading={<CoinGlyph size={16} />}
        ui={ui}
        style={affordable ? undefined : styles.short}
        testID="chapter-gate-unlock"
      />
      {gate.vipDiscount ? (
        <View style={styles.discount} testID="chapter-gate-vip-discount">
          <Tag
            ui={ui}
            tone="gold"
            icon="diamond"
            label={t('chapters.vipDiscount', {
              percent: formatNumber(Math.round(ECONOMY.vipChapterUnlockDiscount * 100)),
            })}
          />
          <Text style={[styles.fullPrice, { color: ui.textMuted }]}>
            {formatNumber(gate.fullPrice)}
          </Text>
        </View>
      ) : null}
      {affordable ? null : (
        <Text style={[styles.balance, { color: ui.textMuted }]} testID="chapter-gate-balance">
          {t('chapters.balance', { count: coins, value: formatNumber(coins) })}
        </Text>
      )}
      <Button variant="ghost" label={t('common.notNow')} onPress={onClose} ui={ui} />
    </Overlay>
  );
};

export const ChapterGateOverlay = memo(ChapterGateOverlayComponent);

const styles = StyleSheet.create({
  progress: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  progressText: {
    textAlign: 'center',
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  discount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: -spacing.xxs,
  },
  fullPrice: {
    fontSize: fontSizes.caption,
    textDecorationLine: 'line-through',
  },
  short: {
    opacity: 0.6,
  },
  balance: {
    textAlign: 'center',
    fontSize: fontSizes.caption,
    marginTop: -spacing.xs,
  },
  bar: {
    height: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
