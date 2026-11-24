/**
 * Theme ownership rules (spec §10.5). Pure.
 *
 * - Classic is always owned. Coin themes are owned once bought (`ownedThemes`).
 * - Aurora comes with the Starter Pack (owned when listed or when the pack was bought).
 * - Gold is owned exactly while the VIP entitlement is active; it is never stored in `ownedThemes`.
 *
 * The active theme falls back to Classic whenever it is not available (Gold after VIP lapses, an
 * unknown id). `effectiveThemeId` applies that at read time, so every screen and the board switch
 * the moment entitlements change; the progress store also persists the fallback at startup.
 */
import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from '@/render/themes';
import type { ProgressState } from '@/state/progressModel';

export type ThemeOwnership = Pick<
  ProgressState,
  'ownedThemes' | 'entitlements' | 'starterPackPurchased'
>;

export type ThemeStatus =
  | { readonly kind: 'owned' }
  | { readonly kind: 'coins'; readonly price: number }
  | { readonly kind: 'starterPack' }
  | { readonly kind: 'vip' };

export const themeStatus = (id: ThemeId, owner: ThemeOwnership): ThemeStatus => {
  const unlock = THEMES[id].unlock;
  switch (unlock.kind) {
    case 'free':
      return { kind: 'owned' };
    case 'coins':
      return owner.ownedThemes.includes(id) ? { kind: 'owned' } : unlock;
    case 'starterPack':
      return owner.starterPackPurchased || owner.ownedThemes.includes(id)
        ? { kind: 'owned' }
        : { kind: 'starterPack' };
    case 'vip':
      return owner.entitlements.vip ? { kind: 'owned' } : { kind: 'vip' };
  }
};

/** True when `id` is a known theme the player may apply right now. */
export const isThemeAvailable = (id: string, owner: ThemeOwnership): id is ThemeId =>
  isThemeId(id) && themeStatus(id, owner).kind === 'owned';

/** The theme to draw: the active one while it is available, otherwise Classic. */
export const effectiveThemeId = (activeTheme: string, owner: ThemeOwnership): ThemeId =>
  isThemeAvailable(activeTheme, owner) ? activeTheme : DEFAULT_THEME.id;
