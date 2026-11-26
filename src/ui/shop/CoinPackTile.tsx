import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';
import { CoinGlyph } from '@/ui/CoinBadge';
import { Tag } from '@/ui/Tag';
import { surfaceColors } from '@/ui/theme';
import { fontSizes, fontWeights, radii, spacing } from '@/ui/tokens';
import { Text } from '@/ui/Text';

export interface CoinPackTileProps {
  ui: ThemeUi;
  /** 1–3: how many coins the artwork stacks (bigger packs look bigger). */
  tier: number;
  /** "1,500 coins". */
  amount: string;
  /** "Bag of coins". */
  name: string;
  /** Optional ribbon ("Popular", "Best value"). */
  tag?: string;
  /** Draws the tile with an accent outline (the highlighted pack). */
  highlighted?: boolean;
  /** The price pill. */
  price: ReactNode;
  testID?: string;
}

const GLYPH = 26;

/** A coin pack in the Shop's three-column grid: artwork, amount, name and a price pill. */
const CoinPackTileComponent = ({
  ui,
  tier,
  amount,
  name,
  tag,
  highlighted = false,
  price,
  testID,
}: CoinPackTileProps) => (
  <View
    style={[
      styles.tile,
      {
        backgroundColor: ui.surface,
        borderColor: highlighted ? ui.accent : surfaceColors(ui).hairline,
      },
      highlighted && styles.highlighted,
    ]}
    testID={testID}
  >
    <View style={styles.tagSlot}>
      {tag !== undefined ? (
        <Tag ui={ui} label={tag} tone={highlighted ? 'accent' : 'gold'} />
      ) : null}
    </View>
    <View style={[styles.art, { backgroundColor: surfaceColors(ui).accentWash }]}>
      {Array.from({ length: Math.max(1, Math.min(3, tier)) }, (_, index) => (
        <View key={index} style={index > 0 && styles.stacked}>
          <CoinGlyph size={GLYPH} />
        </View>
      ))}
    </View>
    <View style={styles.texts}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: ui.text }]}>
        {amount}
      </Text>
      <Text numberOfLines={1} style={[styles.name, { color: ui.textMuted }]}>
        {name}
      </Text>
    </View>
    {price}
  </View>
);

export const CoinPackTile = memo(CoinPackTileComponent);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  highlighted: {
    borderWidth: 1.5,
  },
  tagSlot: {
    height: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: -9,
  },
  art: {
    height: 44,
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stacked: {
    marginStart: -GLYPH / 2,
  },
  texts: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 1,
  },
  amount: {
    fontSize: fontSizes.callout,
    fontWeight: fontWeights.heavy,
  },
  name: {
    fontSize: fontSizes.caption,
  },
});
