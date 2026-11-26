import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from './Text';
import { colors } from './tokens';

/**
 * Splits `text` around every ★ and draws the stars in the gold star color, for use inside a
 * `Text` ("5/40★ to unlock", "Collect 40★ in chapter 1…"). Text without ★ comes back as is.
 */
export const withGoldStars = (text: string): ReactNode => {
  if (!text.includes('★')) return text;
  const parts = text.split('★');
  const out: ReactNode[] = [];
  parts.forEach((part, index) => {
    if (part.length > 0) out.push(part);
    if (index < parts.length - 1) {
      out.push(
        <Text key={index} style={styles.star}>
          ★
        </Text>,
      );
    }
  });
  return out;
};

const styles = StyleSheet.create({
  star: {
    color: colors.star,
  },
});
