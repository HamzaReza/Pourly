# Firebase setup

Pourly uses Firebase for optional Google sign-in, cloud save, server-side purchase fulfillment,
account deletion and a small Hosting site. The app works fully without any of it: a build without
the Firebase config or the Google Web client id runs in **cloud-disabled** mode (guest only,
Settings → Account says "Sign-in unavailable in this build").

The app uses the **Firebase JS SDK** (not React Native Firebase), so there is **no
`google-services.json`**: the web config goes into `.env` (DECISIONS O2).

> **Billing: Cloud Functions require the Blaze (pay-as-you-go) plan.** `revenuecatWebhook` and
> `deleteMyAccount` cannot be deployed on the free Spark plan. Blaze keeps the free-tier quotas, which
> a game of this size usually stays within, but a billing account is required. Set a budget alert in
> Google Cloud Billing. Without Blaze, see [Running without Cloud Functions](#running-without-cloud-functions).

## 1. Create the project

1. In the [Firebase console](https://console.firebase.google.com/) create a project (for example
   `pourly-app`). Google Analytics is not needed (the app has no Firebase Analytics in v1).
2. **Upgrade to Blaze** (Project settings → Usage and billing).
3. **Firestore**: Build → Firestore Database → Create database, production mode, location
   `nam5 (us-central)` (the Functions run in `us-central1`).
4. **Authentication**: Build → Authentication → Get started → Sign-in method → enable **Google**.
   Set the public-facing name ("Pourly") and the support email.

## 2. Register the apps

### Android app

Project settings → Your apps → Add app → Android:

- Package name: **`com.pourly.water.app`** (or your `ANDROID_PACKAGE`).
- Add **every** signing certificate's SHA-1 **and** SHA-256 (Google sign-in fails with
  `DEVELOPER_ERROR` / code 10 for an unregistered key):
  - **Debug keystore** (local `expo run:android` builds):
    `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
  - **EAS upload key** (EAS builds, internal APKs): `eas credentials` → Android → the build
    profile's keystore shows SHA-1 and SHA-256.
  - **Play App Signing key** (anything installed from Google Play): Play Console → Test and
    release → App integrity → App signing → "App signing key certificate".
- You do **not** need to download `google-services.json`.

Adding the Android app with its SHA certificates makes Firebase create the Android OAuth clients
that Google Sign-In checks behind the scenes.

### Web app (config and client id)

1. Project settings → Your apps → Add app → **Web** (name "Pourly web"; no Hosting checkbox
   needed). Copy the `firebaseConfig` values into `.env`:

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=<project>
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   EXPO_PUBLIC_FIREBASE_APP_ID=...
   ```

2. Authentication → Sign-in method → Google → **Web SDK configuration** → copy the **Web client
   ID** into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. (It is also listed in Google Cloud console →
   APIs & Services → Credentials as "Web client (auto created by Google Service)".) The app passes
   it to `GoogleSignin.configure({ webClientId })` so Google returns an ID token Firebase accepts.

These values are public identifiers, not secrets; they are baked into the app at build time.
For EAS builds, add them as EAS environment variables (or a `.env` the build can read).

`EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` may stay empty: they then default to
`https://<project id>.web.app/privacy` and `/terms` (Hosting pages added in phase 10).

## 3. Firebase CLI

```sh
npm i -g firebase-tools        # or use the copy in firebase/ (cd firebase && yarn && npx firebase ...)
firebase login                 # once, on your machine
firebase use --add             # pick your project; replaces the placeholder in .firebaserc
```

`.firebaserc` in the repo contains the placeholder project id **`pourly-app`**. Either create your
project with that id or run `firebase use --add` and commit the change.

## 4. Deploy

From the repository root:

```sh
cd functions && yarn install && cd ..
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET   # paste a long random value
firebase deploy --only firestore:rules
firebase deploy --only functions                            # runs `yarn build` (predeploy)
firebase deploy --only hosting                              # writes public/site-config.js first
```

- `functions` predeploy copies `shared/products.ts` into `functions/src/shared/` (gitignored) and
  compiles to `functions/lib/`.
- `hosting` predeploy (`scripts/write-hosting-config.mjs`) writes `public/site-config.js`
  (gitignored) with `EXPO_PUBLIC_SUPPORT_EMAIL` from the environment or `.env`, so the delete page
  can show the support address.
- Hosting serves `public/` with `cleanUrls`: `/delete-account` serves `delete-account.html`.
  Firebase adds `<project>.web.app` and `<project>.firebaseapp.com` to Authentication → Settings →
  Authorized domains automatically; add any custom domain there yourself.

Never commit `.env`, service-account keys or the webhook secret.

## 5. RevenueCat

### Webhook (server-side fulfillment)

RevenueCat → Project → Integrations → **Webhooks** → Add:

- **URL**: `https://us-central1-<project>.cloudfunctions.net/revenuecatWebhook` (the deploy output
  also prints the function's `run.app` URL; either works).
- **Authorization header value**: exactly the value you stored in `REVENUECAT_WEBHOOK_SECRET`
  (for example `Bearer 3f8c…`). The function compares the whole header with the secret in constant
  time and answers 401 on a mismatch, 500 when the secret is missing.
- Environment: production and sandbox (sandbox purchases by license testers are granted too).
- Events: all. The function grants only for `INITIAL_PURCHASE` / `NON_RENEWING_PURCHASE` of
  consumables and the Starter Pack, writes a negative grant for refunds (`CANCELLATION` with
  `cancel_reason = CUSTOMER_SUPPORT`, or `REFUND`), never grants for `TRANSFER`, and acknowledges
  everything else with 200 (entitlements come from RevenueCat on the device). Events for anonymous
  `$RCAnonymousID:` users are acknowledged and skipped.

Use RevenueCat's "Send test event" to check the URL and header (expect `200`, `reason: "test"`).

### "Transfer to new App User ID" (guest → account)

At sign-in the app calls `Purchases.logIn(<Firebase uid>)`. What happens to purchases made as a
guest (anonymous RevenueCat id) is a project setting: RevenueCat → Project settings → General →
**Restore behavior**:

- **Transfer to new App User ID** (RevenueCat's default, recommended): a guest's purchases follow
  the player into the account they sign in to. A store account's purchases can belong to one app
  user at a time; restoring on another Firebase account moves them there (a `TRANSFER` event,
  which never grants anything).
- "Keep with original App User ID" would block the second account from restoring.

When the guest's anonymous id has never been linked to an account, `logIn` with a new uid simply
aliases it: the guest's purchases and entitlements become the account's. Signing out
(`Purchases.logOut()`) returns RevenueCat to a fresh anonymous id, so entitlements (Remove Ads,
VIP) stay with the account and disappear from the device until the player signs in again or
restores purchases.

Consumables bought as a guest were already granted on the device; they reach the account through
cloud save (merged at sign-in), never through a webhook grant.

### Server vs device fulfillment

| Player                                                 | Who grants coins / Starter Pack items                   |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Guest                                                  | The device, right after the purchase                    |
| Signed in, RevenueCat logged in as the uid             | The webhook → `users/{uid}/grants/{transactionId}`      |
| Signed in but RevenueCat `logIn` has not succeeded yet | The device (the webhook would only see an anonymous id) |
| `USE_SERVER_FULFILLMENT = false`                       | The device, for everyone                                |

Both paths use the store transaction id (Google Play order id `GPA.…`), so the device's
`processedTransactions` list stops a purchase from being granted twice.

## 6. Google Play account deletion URL

Play Console → App content → **Data safety** → "Delete account URL":
`https://<project>.web.app/delete-account`. The page signs in with Google (Firebase web Auth),
calls the same `deleteMyAccount` function as the app and explains that guest progress lives only
on the device (uninstall to remove it). In the app: Settings → Account → Delete account and data.

`deleteMyAccount` takes no parameters and acts only on the caller's `request.auth.uid`: it deletes
`users/{uid}` recursively (cloud save and grants), then the Auth user. Calling it again is
harmless.

## Running without Cloud Functions

Set `USE_SERVER_FULFILLMENT = false` in `src/config/constants.ts`. Every purchase is then granted
on the device (as for guests); the webhook and `deleteMyAccount` are not needed for purchases.
Sign-in and cloud save keep working on the Spark plan, but **in-app account deletion needs
`deleteMyAccount`**, which needs Blaze; Google Play requires account deletion for apps with
accounts, so on Spark either keep Blaze for that one function or remove sign-in from the build
(leave `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` empty → cloud disabled).

## Firestore data and rules

```
users/{uid}                        cloud save (client-written, validated by the rules)
users/{uid}/grants/{grantId}       server grants (webhook-written; clients may only mark applied)
```

`firebase/firestore.rules`: the owner reads and writes `users/{uid}`; every write must be the full
snapshot with known fields only, non-negative integer balances, `level ≥ 1`, at most 200
transaction ids, 120 daily results, 50 themes, a 20 000-entry stars map, bounded strings, ISO
dates and `updatedAt == request.time`. Clients cannot delete the save. Grants: readable by the
owner, never created or deleted by clients; the only update allowed is `applied: false → true`
with `appliedAt == request.time` and no other field changed. Everything else is denied.

## Emulators and rules tests

The Firestore emulator needs **Java 21 or newer** (`firebase-tools` 15 refuses older JDKs with
"firebase-tools no longer supports Java version before 21"). JDK 17 is not enough.

```sh
cd firebase
yarn install                        # firebase-tools 15.37.0, @firebase/rules-unit-testing 5, vitest
JAVA_HOME=/path/to/jdk-21 yarn test:rules   # starts the Firestore emulator and runs vitest
JAVA_HOME=/path/to/jdk-21 yarn emulators    # emulator only (port 8080)
```

On macOS, `/usr/libexec/java_home -V` lists installed JDKs; Android Studio ships JetBrains Runtime
21 (`~/Library/Java/JavaVirtualMachines/jbr-21*/Contents/Home` or inside Android Studio's
`Contents/jbr`). The project id for emulator runs can be any `demo-*` id
(`--project demo-pourly`), which never touches a real project.

`functions/` has `yarn serve` (build + Functions, Firestore and Auth emulators).

### Manual rules check (without the emulator)

In the Firebase console → Firestore → Rules → **Rules Playground**, with "Authenticated" and
uid `alice`:

1. `get /users/alice` → allowed; `get /users/bob` → denied.
2. `create /users/alice` with a full valid snapshot (all fields listed above, `updatedAt` = request
   time) → allowed; with `coins: -1`, an extra `entitlements` field or a missing field → denied.
3. `update /users/alice/grants/x` where the stored doc has `applied: false`, changing only
   `applied: true` and `appliedAt` (request time) → allowed; changing `coins` → denied.
4. `create` or `delete` on `/users/alice/grants/x` → denied; any other collection → denied.
