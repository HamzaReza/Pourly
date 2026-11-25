import { PUBLIC_ENV } from './env';

export { CAPACITY } from './game';

/**
 * Signed-in purchases are fulfilled by the `revenuecatWebhook` Cloud Function (requires the
 * Firebase Blaze plan). When false, every purchase is fulfilled on the device.
 */
export const USE_SERVER_FULFILLMENT = true;

/**
 * The Firebase Hosting site (`public/`) when a project id is configured: privacy, terms and the
 * account deletion page live there. Without one, the old placeholders remain.
 */
const HOSTING_ORIGIN =
  PUBLIC_ENV.firebase.projectId.length > 0
    ? `https://${PUBLIC_ENV.firebase.projectId}.web.app`
    : 'https://example.com';
const FALLBACK_SUPPORT_EMAIL = 'support@example.com';

export const PRIVACY_URL = PUBLIC_ENV.privacyUrl || `${HOSTING_ORIGIN}/privacy`;
export const TERMS_URL = PUBLIC_ENV.termsUrl || `${HOSTING_ORIGIN}/terms`;
/** Web page for deleting the account and its data (Google Play account deletion URL). */
export const DELETE_ACCOUNT_URL = `${HOSTING_ORIGIN}/delete-account`;
export const SUPPORT_EMAIL = PUBLIC_ENV.supportEmail || FALLBACK_SUPPORT_EMAIL;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export const MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

/** Persisted store keys in AsyncStorage. */
export const STORAGE_KEYS = {
  settings: 'pourly.settings',
  progress: 'pourly.progress',
  game: 'pourly.game',
  /** Cloud-sync bookkeeping (pending push, account link, Home sign-in card). */
  cloud: 'pourly.cloud',
  /** Development only: purchases made with the mock store. */
  iapMock: 'pourly.iapMock',
} as const;
