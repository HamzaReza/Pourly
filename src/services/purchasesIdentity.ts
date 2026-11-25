/**
 * RevenueCat identity (spec §26.3, `react-native-purchases` v11, verified in `dist/purchases.d.ts`):
 * `Purchases.logIn(appUserID)` resolves `{ customerInfo, created }`; `Purchases.logOut()` resolves
 * `CustomerInfo` and rejects when the current user is anonymous, so `isAnonymous()` is checked
 * first. Both trigger the customer-info listener, which keeps entitlements in sync.
 *
 * Only the RevenueCat provider has accounts; with the mock or unavailable store this is a no-op,
 * and signed-in purchases stay on device fulfillment (there is no webhook behind the mock).
 */
import { logger } from '@/utils/logger';

import { getIapProvider } from './iap';

type PurchasesModule = typeof import('react-native-purchases');

export type PurchasesIdentityLoader = () => Promise<PurchasesModule>;

let loader: PurchasesIdentityLoader = () => import('react-native-purchases');

/** Replaces the SDK loader (tests). */
export const setPurchasesIdentityLoader = (next: PurchasesIdentityLoader): void => {
  loader = next;
};

/** Loads RevenueCat once the provider has configured it; null for the mock or no store. */
const configuredPurchases = async (): Promise<PurchasesModule['default'] | null> => {
  const provider = getIapProvider();
  if (provider.kind !== 'revenuecat') return null;
  await provider.init();
  return (await loader()).default;
};

/**
 * Logs RevenueCat in as the Firebase uid. Guest purchases move to the account according to the
 * project's "Transfer to new App User ID" setting (docs/FIREBASE_SETUP.md). Resolves true only
 * when RevenueCat now identifies the player by `uid` (so the webhook can find them).
 */
export const logInPurchases = async (uid: string): Promise<boolean> => {
  try {
    const purchases = await configuredPurchases();
    if (purchases === null) return false;
    await purchases.logIn(uid);
    return true;
  } catch (error: unknown) {
    logger.warn('RevenueCat logIn failed', error);
    return false;
  }
};

/** Returns RevenueCat to an anonymous id (no-op when it already is anonymous). */
export const logOutPurchases = async (): Promise<void> => {
  try {
    const purchases = await configuredPurchases();
    if (purchases === null) return;
    if (await purchases.isAnonymous()) return;
    await purchases.logOut();
  } catch (error: unknown) {
    logger.warn('RevenueCat logOut failed', error);
  }
};
