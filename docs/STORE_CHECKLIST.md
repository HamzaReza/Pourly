# Google Play store checklist

Everything needed to publish **Pourly: Water Sort Puzzle** on Google Play. Android only; there is
no iOS setup. Work top to bottom: several steps depend on earlier ones (RevenueCat needs the Play
products, the products need an uploaded build with the billing permission, the data-safety form
needs the hosted pages).

Facts used throughout:

| Item                     | Value                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Developer                | Infratek Systems                                                                                   |
| Support / privacy        | rezahamza5@gmail.com                                                                               |
| Package (application id) | `com.pourly.water.app` (**permanent** once the first build is uploaded)                            |
| Store title              | `Pourly: Water Sort Puzzle` (25 characters)                                                        |
| Hosting origin           | `https://pourly-app.web.app` (placeholder project `pourly-app`; use your project id)               |
| Privacy policy URL       | `https://pourly-app.web.app/privacy-policy` (the app links `/privacy`, which serves the same page) |
| Terms URL                | `https://pourly-app.web.app/terms-of-service` (the app links `/terms`)                             |
| Account deletion URL     | `https://pourly-app.web.app/delete-account`                                                        |

Before starting: Firebase is set up and Hosting is deployed (`docs/FIREBASE_SETUP.md`), so the
three URLs above load.

## 1. Create the app

- [ ] Play Console → **Create app**: name `Pourly: Water Sort Puzzle`, default language English
      (United States), **Game**, **Free**, accept the declarations.
- [ ] Store settings → App category: **Game → Puzzle**. Tags: Puzzle, Casual, Offline, Single
      player. Contact email `rezahamza5@gmail.com`; website `https://pourly-app.web.app`.
- [ ] Set up a **payments profile** (merchant account) for the developer account; in-app products
      cannot be created without it.
- [ ] Test and release → App integrity → **Play App Signing**: keep Google-managed signing (the
      default for new apps). Copy the **app signing key** SHA-1 and SHA-256 into Firebase (see
      `docs/FIREBASE_SETUP.md` §2); Google sign-in fails on Play installs without it.

## 2. App content (Policy → App content)

### Privacy policy

- [ ] URL: `https://pourly-app.web.app/privacy-policy` (source: `docs/PRIVACY_POLICY.md`, page:
      `public/privacy-policy.html`).

### Ads

- [ ] **Contains ads: Yes** (AdMob rewarded and interstitial).

### App access

- [ ] **All functionality is available without special access.** Sign-in is optional (Google
      account picker only, no credentials to provide).

### Content rating (IARC questionnaire)

- [ ] Category: **Game**. Expected answers (none of the content questions apply):

| Question                                   | Answer                                         |
| ------------------------------------------ | ---------------------------------------------- |
| Violence, blood, fear, horror              | No                                             |
| Sexuality, nudity                          | No                                             |
| Crude humour, profanity                    | No                                             |
| Drugs, alcohol, tobacco                    | No                                             |
| Gambling or simulated gambling             | No (no loot boxes or random paid rewards)      |
| Users can interact or exchange content     | No (single player, no chat, no user content)   |
| Shares the user's current location         | No                                             |
| Allows purchases of digital goods          | **Yes** (coins, Remove Ads, Starter Pack, VIP) |
| Unrestricted internet access / web browser | No                                             |

Expected result: Everyone / PEGI 3 / USK 0 class ratings, with the **In-App Purchases**
interactive element.

### Target audience and content

- [ ] Target age groups: **18 and over** (optionally 16–17). Do **not** select any group under 13:
      the app is not designed for children and does not follow the Families policy (AdMob runs with
      `tagForChildDirectedTreatment: false` and `tagForUnderAgeOfConsent: false`, max ad rating
      PG). Selecting 13–15 also needs a legal check of EEA under-16 consent before launch.
- [ ] "Could your store listing unintentionally appeal to children?" → **No**; keep the listing
      art free of child-oriented characters.

### News, COVID-19, government, financial features, health

- [ ] Not a news app; no COVID-19 tracing; not a government app; no financial features; no health
      features.

### Advertising ID

- [ ] **Yes, the app uses an advertising ID** → purposes **Advertising or marketing** (AdMob). The
      merged manifest contains `com.google.android.gms.permission.AD_ID` (DECISIONS P7.22).

### Data safety

Answer the overview questions:

- [ ] Does the app collect or share any of the required user data types? **Yes**
- [ ] Is all user data encrypted in transit? **Yes** (HTTPS/TLS to Firebase, RevenueCat and AdMob)
- [ ] Do you provide a way for users to request that their data is deleted? **Yes**: in the app
      (Settings → Account → Delete account and data) and at
      `https://pourly-app.web.app/delete-account`.
- [ ] Delete account URL (required because the app lets users create an account):
      `https://pourly-app.web.app/delete-account`.

Data types. "Collected" = sent off the device. Service providers processing data on our behalf
(Firebase, RevenueCat) count as **collected, not shared**; AdMob is Google's own advertising
service and is declared as **shared** (Google's AdMob data-disclosure guidance).

| Data type (Play category)                                                                                       | SDK / service                        | Collected | Shared | Optional / required                                                                                            | Purposes                                                                       | Ephemeral |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------- | ------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| Personal info → **Email address**                                                                               | Firebase Auth (Google sign-in)       | Yes       | No     | Optional (only when signing in)                                                                                | Account management, App functionality                                          | No        |
| Personal info → **Name** (display name)                                                                         | Firebase Auth (Google sign-in)       | Yes       | No     | Optional (only when signing in)                                                                                | Account management                                                             | No        |
| Personal info → **User IDs** (Firebase uid; RevenueCat app user id)                                             | Firebase Auth, Firestore, RevenueCat | Yes       | No     | Required (RevenueCat assigns an anonymous id whenever the store starts; the Firebase uid only when signing in) | App functionality, Account management, Fraud prevention                        | No        |
| Financial info → **Purchase history**                                                                           | RevenueCat (Google Play Billing)     | Yes       | No     | Optional (only when buying)                                                                                    | App functionality (deliver and restore purchases), Fraud prevention            | No        |
| App activity → **Other actions** (game progress: levels, stars, balances, streaks, themes, delivered order ids) | Cloud Firestore                      | Yes       | No     | Optional (only when signed in)                                                                                 | App functionality (cloud save)                                                 | No        |
| Device or other IDs (**advertising ID**, app set ID)                                                            | Google AdMob                         | Yes       | Yes    | Required (ads; personalisation needs consent in the EEA/UK)                                                    | Advertising or marketing, Analytics, Fraud prevention, security and compliance | No        |
| Location → **Approximate location** (from IP address)                                                           | Google AdMob                         | Yes       | Yes    | Required                                                                                                       | Advertising or marketing, Analytics, Fraud prevention                          | No        |
| App activity → **App interactions** (ad views, clicks, app launches)                                            | Google AdMob                         | Yes       | Yes    | Required                                                                                                       | Advertising or marketing, Analytics                                            | No        |
| App info and performance → **Diagnostics** (ad SDK performance, crash data)                                     | Google AdMob                         | Yes       | Yes    | Required                                                                                                       | Analytics, Fraud prevention, security and compliance                           | No        |

Not collected: precise location, contacts, photos/videos, audio, files, calendar, messages, web
history, health, installed apps, crash logs from our own code (no Crashlytics), analytics (no
analytics vendor). Local notifications collect nothing (no push tokens). Google Sign-In's own
processing happens in Google Play services under Google's policy.

- [ ] Re-check the AdMob rows against Google's current
      [AdMob data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
      and RevenueCat's Google Play data safety documentation at submission time; SDK disclosures
      change.

### Financial features, government apps, Families

- [ ] Not applicable.

## 3. In-app products and subscriptions (Monetize → Products)

Upload a build with the billing permission first (§7: an internal-track AAB); Play only enables
product creation once it has seen `com.android.vending.BILLING`.

### One-time products

Ids must match `shared/products.ts` **exactly**. Suggested US base prices (Play converts to local
prices; adjust as you like):

| Product id     | Type in Play                                        | Contents                                                                      | Suggested price |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| `coins_500`    | One-time, consumable                                | 500 coins                                                                     | US$0.99         |
| `coins_1500`   | One-time, consumable                                | 1500 coins                                                                    | US$2.99         |
| `coins_4000`   | One-time, consumable                                | 4000 coins                                                                    | US$6.99         |
| `remove_ads`   | One-time, **non-consumable** (entitlement `no_ads`) | Removes interstitial ads                                                      | US$3.99         |
| `starter_pack` | One-time, **non-consumable**                        | 1500 coins, 10 hints, 10 undos, Aurora theme (offered for 72 h after level 8) | US$1.99         |

- [ ] Create each product, set the title (Play appends the app name) and description, price,
      and **activate** it. Play's "one-time product" has no consumable flag: consumption is
      decided by RevenueCat's product type (next section).

### Subscriptions

| Subscription id | Base plan id (suggested) | Billing period | Renewal       | Suggested price | Entitlement |
| --------------- | ------------------------ | -------------- | ------------- | --------------- | ----------- |
| `vip_weekly`    | `weekly`                 | 1 week         | Auto-renewing | US$2.99         | `vip`       |
| `vip_monthly`   | `monthly`                | 1 month        | Auto-renewing | US$7.99         | `vip`       |

- [ ] Create both subscriptions with one auto-renewing base plan each and **activate** the base
      plans. The base plan id is free-form: the app maps a Play product by the part before `:`
      (`vip_weekly:weekly` → `vip_weekly`, DECISIONS P7.2). No free trial or introductory offer is
      assumed by the app's copy; if you add one, update the store listing.
- [ ] Grace period and account hold: keep Play's defaults; RevenueCat handles them.
- [ ] VIP benefits (in-app copy and listing must match): no interstitial ads, 2× daily gift, +100
      coins and +3 hints once a day, the Gold theme, VIP badge, one streak freeze per week.

### License testing

- [ ] Setup → **License testing**: add the testers' Google accounts (test purchases are free and
      subscriptions renew every few minutes). Add the same accounts to the internal testing track.

## 4. RevenueCat dashboard

- [ ] Create a project and a **Google Play** app with package `com.pourly.water.app`.
- [ ] **Play service-account credentials**: in Google Cloud create a service account, enable the
      Google Play Android Developer API and Google Play Developer Reporting API, create a JSON key;
      in Play Console → Users and permissions invite the service account with "View app information",
      "View financial data" and "Manage orders and subscriptions"; upload the JSON in RevenueCat
      (App settings → Service account credentials). Credentials can take up to 36 h to become valid.
- [ ] Optional but recommended: **Real-time developer notifications** (Google Cloud Pub/Sub topic
      from RevenueCat's app settings, pasted in Play Console → Monetization setup).
- [ ] **Products**: import or add all seven ids. Set the product type for each one-time product:
  - `coins_500`, `coins_1500`, `coins_4000` → **Consumable**
  - `remove_ads` → **Non-consumable**
  - `starter_pack` → **Non-consumable** (required: otherwise Restore cannot bring back the Aurora
    theme and the "purchased" flag, and Play would let it be bought again; DECISIONS P7.6)
  - `vip_weekly:weekly`, `vip_monthly:monthly` → subscriptions (imported with their base plans)
- [ ] **Entitlements**: `no_ads` (attach `remove_ads`) and `vip` (attach `vip_weekly` and
      `vip_monthly`). Coins and the Starter Pack have no entitlement.
- [ ] **Offering** `default` (mark it Current) with one package per product. Package identifiers
      are free (custom ids such as `coins_500` are clearest; `$rc_weekly` / `$rc_monthly` for the
      subscriptions work too): the app matches packages by **product id**, not package id.
- [ ] **Public SDK key** (Google) → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
- [ ] **Webhook** (Integrations → Webhooks), needed because `USE_SERVER_FULFILLMENT` is `true`:
  - URL `https://us-central1-<project>.cloudfunctions.net/revenuecatWebhook`
  - **Authorization header** = exactly the value stored with
    `firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET` (for example `Bearer <random>`)
  - Environments: production and sandbox; events: all
  - "Send test event" must answer `200`.
- [ ] **Transfer behaviour** (Project settings → General → Restore behavior): **Transfer to new App
      User ID** (default). A guest's purchases follow the player into the account they sign in to;
      restoring on another account moves them (`TRANSFER` events never grant items). Details in
      `docs/FIREBASE_SETUP.md` §5.

## 5. AdMob

- [ ] AdMob → Apps → **Add app** → Android, "Yes, it's listed" once the listing is live (or add it
      unlisted now and link the store listing later). Copy the **App ID**
      (`ca-app-pub-…~…`) → `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`.
- [ ] Ad units → **Rewarded** (name "Rewarded", reward 1 "reward"; the app decides the actual
      reward, so server-side verification is not used) → `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID`.
- [ ] Ad units → **Interstitial** → `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID`. No banner units (the
      app has none).
- [ ] App settings → blocking controls: maximum ad content rating **PG** (the app also requests PG
      in code, DECISIONS P7.10). Consider blocking sensitive categories (gambling, dating).
- [ ] **Privacy & messaging → GDPR**: create a **European regulations** message for the app
      (languages: at least English plus the 13 app languages if offered), choose "Consent" and
      "Manage options", select the ad partners, link the privacy policy URL, and **publish** it.
      UMP shows it in the EEA, the UK and Switzerland; the app's Settings → "Ad privacy options"
      reopens it. Also review the **US state regulations** message (optional; adds a "Do not sell or
      share" entry) to support the CCPA note in the privacy policy.
- [ ] **app-ads.txt**: AdMob → Apps → app-ads.txt shows your line
      (`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`). Add it as `public/app-ads.txt`,
      deploy Hosting so it is served at `https://pourly-app.web.app/app-ads.txt`, and set the
      **Website** field of the Play store listing to `https://pourly-app.web.app` (app-ads.txt must
      live at the root of the developer website domain). AdMob verifies it within about 24 h.
- [ ] Fill `.env` (or EAS environment variables for the `production` profile) with the three AdMob
      values. `preview` builds keep Google's sample app id and test units (`eas.json`).
- [ ] Never click your own production ads; test with the `preview` profile or a development build.

## 6. Environment for the production build

Set these as EAS environment variables (visibility "Plain text" or "Sensitive"; they are public
identifiers baked into the app, not secrets) for the `production` profile:

- [ ] `ANDROID_PACKAGE=com.pourly.water.app`
- [ ] `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- [ ] `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID`,
      `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID`
- [ ] `EXPO_PUBLIC_SUPPORT_EMAIL` (defaults to rezahamza5@gmail.com); `EXPO_PUBLIC_PRIVACY_URL` and
      `EXPO_PUBLIC_TERMS_URL` empty (they default to the Hosting pages) or set to the
      `/privacy-policy` and `/terms-of-service` URLs
- [ ] `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and all six `EXPO_PUBLIC_FIREBASE_*` values
- [ ] **Not** `EXPO_PUBLIC_ADS_USE_TEST_IDS` or `EXPO_PUBLIC_UMP_DEBUG_EEA` (development and
      `preview` only)

## 7. Build and submit with EAS

```sh
npm i -g eas-cli          # once
eas login
eas init                  # links the project (writes the EAS project id)
eas build --platform android --profile preview      # release-mode APK, test ads: device checks
eas build --platform android --profile production   # AAB, versionCode auto-incremented remotely
eas submit --platform android --profile production  # uploads to the internal track (eas.json)
```

- [ ] The **first** upload to a new app must be done by hand (Play Console → Internal testing →
      Create release → upload the AAB downloaded from EAS); afterwards `eas submit` works.
- [ ] `eas submit` needs a Google service account JSON with release permissions (EAS →
      credentials, or `serviceAccountKeyPath` in `eas.json`; never commit the key).
- [ ] Run `eas credentials` and copy the **upload key** SHA-1/SHA-256 into Firebase too.
- [ ] Before each store build: `yarn typecheck`, `yarn lint`, `yarn test:ci`, `yarn doctor`,
      `yarn export:android`, and the `functions/` and `firebase/` suites (README).

## 8. Release tracks

- [ ] **Internal testing** (up to 100 testers, available in minutes): license testers; run
      `docs/MANUAL_TEST_CHECKLIST.md`, including real purchases in sandbox and Google sign-in from
      a Play-installed build (Play App Signing SHA).
- [ ] **Closed testing**: new personal developer accounts must run a closed test with **at least 12
      testers opted in for 14 consecutive days** before applying for production access. Collect
      feedback, watch Android vitals.
- [ ] **Production**: staged rollout (for example 10% → 50% → 100%), country availability (all
      target markets), then promote.

## 9. Store listing (Grow → Store presence → Main store listing)

- [ ] Texts from `store-listing/<locale>.md` (13 locales; drafts need **native review** first, see
      `store-listing/README.md`). English: `store-listing/en.md`.
- [ ] App icon **512 × 512** PNG (32-bit, ≤ 1 MB). The current launcher icons in `assets/images/`
      are temporary until phase 11.
- [ ] Feature graphic **1024 × 500** JPG or 24-bit PNG (no alpha).
- [ ] Phone screenshots: 2–8, 16:9 or 9:16, 1080 × 1920 or larger recommended (at least 4 for
      promotion eligibility): first level, a 12+ colour level, the win screen, daily calendar,
      themes, shop with VIP. Optional 7-inch and 10-inch tablet screenshots.
- [ ] Optional promo video (YouTube URL).
- [ ] Translations: add each of the 13 languages (`en-US`, `es-ES` or `es-419`, `pt-BR`, `fr-FR`,
      `de-DE`, `it-IT`, `ru-RU`, `tr-TR`, `id`, `ar`, `hi-IN`, `ja-JP`, `ko-KR`).

## 10. Pre-launch report

- [ ] After uploading to any testing track, open Test and release → **Pre-launch report**. Check
      crashes, ANRs, accessibility warnings (touch target size, contrast, missing labels), security
      warnings and the screenshots on the Firebase Test Lab devices.
- [ ] The robo crawler cannot sign in with Google or buy; that is expected.

## 11. Go-live checklist

- [ ] Firebase on **Blaze**; rules, index, Functions and Hosting deployed; `REVENUECAT_WEBHOOK_SECRET`
      set; webhook test event returns 200.
- [ ] `/privacy-policy`, `/privacy`, `/terms-of-service`, `/terms`, `/delete-account` and
      `/app-ads.txt` load on the Hosting domain; legal texts **reviewed by a lawyer**.
- [ ] Firebase Android app has the SHA-1 and SHA-256 of the debug key, the EAS upload key and the
      **Play App Signing** key.
- [ ] Play products and subscriptions active with the exact ids; RevenueCat products typed
      correctly (`starter_pack` non-consumable), entitlements `no_ads` and `vip`, offering `default`
      current, service-account credentials valid.
- [ ] AdMob app id and both unit ids in the production environment; GDPR message published;
      app-ads.txt verified.
- [ ] Production build made **without** `EXPO_PUBLIC_ADS_USE_TEST_IDS` / `EXPO_PUBLIC_UMP_DEBUG_EEA`;
      the version shown in Settings matches the release.
- [ ] App content complete: privacy policy, ads (yes), app access, content rating, target audience
      (no under-13), advertising ID, data safety (table above), account deletion URL.
- [ ] Store listing texts natively reviewed in all 13 languages; title `Pourly: Water Sort Puzzle`;
      graphics uploaded.
- [ ] `docs/MANUAL_TEST_CHECKLIST.md` passed on the release candidate, including the signed-in
      purchase check (grant document id = Play order id, DECISIONS P9.4).
- [ ] Closed test requirement met (if applicable); staged rollout planned; support inbox
      `rezahamza5@gmail.com` monitored.
