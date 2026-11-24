import { PUBLIC_ENV } from './env';

export { CAPACITY } from './game';

/**
 * Signed-in purchases are fulfilled by the `revenuecatWebhook` Cloud Function (requires the
 * Firebase Blaze plan). When false, every purchase is fulfilled on the device.
 */
export const USE_SERVER_FULFILLMENT = true;

const FALLBACK_PRIVACY_URL = 'https://example.com/privacy';
const FALLBACK_TERMS_URL = 'https://example.com/terms';
const FALLBACK_SUPPORT_EMAIL = 'support@example.com';

export const PRIVACY_URL = PUBLIC_ENV.privacyUrl || FALLBACK_PRIVACY_URL;
export const TERMS_URL = PUBLIC_ENV.termsUrl || FALLBACK_TERMS_URL;
export const SUPPORT_EMAIL = PUBLIC_ENV.supportEmail || FALLBACK_SUPPORT_EMAIL;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export const MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

/** Persisted store keys in AsyncStorage. */
export const STORAGE_KEYS = {
  settings: 'pourly.settings',
  progress: 'pourly.progress',
} as const;
