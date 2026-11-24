# POURLY — Product & Build Specification (v2, Android only, Firebase)

> Source spec supplied by the project owner. Where this spec conflicts with `docs/DECISIONS.md`, DECISIONS.md wins (it records owner-approved deviations, e.g. Firebase JS SDK instead of @react-native-firebase, yarn instead of npm, not working autonomously).

---

## 0. OPERATING RULES (READ FIRST)

1. **Your training data may predate the installed SDK.** Before using any Expo, React Native, Reanimated, Worklets, Skia, notifications, audio, RevenueCat, or AdMob API, verify it against the installed package's TypeScript definitions in `node_modules` and the official docs (Expo docs publish Markdown at `https://docs.expo.dev/llms.txt`; append `.md` to any docs URL). If an API named below differs from the installed version, use the installed version's API and note it in `docs/DECISIONS.md`.
2. **You cannot test on a physical phone.** Prove correctness with everything that CAN be automated (section 22) and generate a manual device checklist for the rest. Never claim a device-level behavior (such as 60fps) was verified unless you measured it.
3. **Firebase backend, offline-first.** Backend = Firebase only (never Supabase), used for Google sign-in, cloud save, and server-side purchase fulfillment (section 26). The game must stay fully playable offline and as a guest without signing in; sign-in is optional and never blocks play.
4. **Never commit secrets.** All keys come from environment variables (section 20). Provide `.env.example`.
5. Initialize git, add a correct `.gitignore`, and commit at logical milestones.
6. TypeScript strict mode. No `any` unless unavoidable and commented. No deep imports from `react-native/Libraries/*`. Use instance ref types such as `ViewInstance` where refs are needed.
7. `InteractionManager` has been removed from current React Native. Use `requestIdleCallback` / `requestAnimationFrame` / scheduled tasks instead.
8. Do not leave TODOs, placeholders, lorem ipsum, stub functions, or commented-out code. Every screen, service, and script described must exist and work.

---

## 1. PRODUCT

**Name:** Pourly. Store title (exactly): `Pourly: Water Sort Puzzle` (25 chars, must stay within 30). App display name on the device: `Pourly`.
**Genre:** Hybrid-casual puzzle. Core loop = color sort (pour liquid between tubes until every tube holds a single color). Meta layer = daily challenge, streaks, daily gifts, coins, themes, hard levels, stars.
**Audience:** Global. Gameplay has zero text on the board. Target the US, Europe, Brazil, India, Southeast Asia, Middle East, Japan/Korea.
**Platform:** ANDROID ONLY for now. Do not add, configure, document, or test anything for iOS/Apple (no iOS bundle id, ATT, Apple Sign-In, App Store Connect, iOS ad IDs, iOS RevenueCat key). Keep code platform-neutral where free, but build, config, and docs target Android only.
**Session design:** 30–90 second levels, instant restart, first level playable within 3 seconds of launch with no onboarding screens.

---

## 2. NON-NEGOTIABLE QUALITY BARS

- **Performance:** target a steady 60 fps on a low/mid-range Android phone (Snapdragon 6-series class, 3–4 GB RAM) in a RELEASE build. Touch to visible feedback within one frame. No dropped frames during pours, win sequences, or modal transitions. See 8.5.
- **Instant feel:** restart under 300 ms, next level under 500 ms, no spinners between levels.
- **Offline-first:** everything works with no network (ads/IAP gracefully unavailable).
- **International:** 13 languages, RTL-safe, localized prices from the store, localized notifications, localized store listing drafts.
- **Accessible:** color-blind symbol mode, reduced motion respected, screen-reader labels, 44 dp minimum touch targets.
- **Not annoying:** strict ad frequency caps, never interrupt mid-pour, never show interstitials early in the first session.
- **Honest verification:** typecheck, lint, tests, `expo-doctor`, and an Android JS bundle export must all pass.

---

## 3. TECH STACK AND VERSION POLICY

**Use the current stable Expo SDK at build time** (spec author expected Expo SDK 58 / RN 0.88 / React 19.2, New Architecture only, Reanimated 4.x with `react-native-worklets`). If the scaffold gives a different current SDK, use that and record it.

**Version rules:**
- Install every Expo-managed or Expo-bundled library with `npx expo install <pkg>` so versions are SDK-aligned. Never hand-pin React Native, React, Reanimated, Worklets, Gesture Handler, Screens, Safe Area, Skia, or `expo-*` packages.
- For `react-native-purchases` and `react-native-google-mobile-ads`, use `npx expo install` as well. If a config-plugin error appears, upgrade to the newest release of the package, re-run, and note the fix in `docs/DECISIONS.md`.
- After installing, run `npx expo install --fix` and `npx expo-doctor` until clean. Record final resolved versions of every dependency in `README.md`.
- **Do not enable the React Compiler.**
- No NativeWind or CSS-in-JS runtime. Use `StyleSheet` plus a small design-token module.
- **Development build required** (`expo-dev-client`). Expo Go only for quick UI checks.

**Dependencies:**
- Runtime: `expo-router`, `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `@shopify/react-native-skia`, `expo-haptics`, `expo-audio`, `expo-notifications`, `expo-localization`, `expo-dev-client`, `expo-build-properties`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-store-review`, `expo-linking`, `expo-constants`, `expo-application`, `@expo/vector-icons`, `@react-native-async-storage/async-storage`, `zustand`, `i18next`, `react-i18next`, `react-native-purchases`, `react-native-google-mobile-ads`. Plus section 26 packages (see DECISIONS.md: `firebase` JS SDK + `@react-native-google-signin/google-signin`).
- Dev: `typescript`, `jest`, `jest-expo`, `@testing-library/react-native`, `eslint`, `eslint-config-expo`, `prettier`, `tsx`, `sharp`, `@types/jest`.

---

## 4. BOOTSTRAP

Scaffold with `create-expo-app@latest` (default template), strip all demo screens/components, install packages, run `expo-doctor`. Use Expo Router with typed routes. Use `app.config.ts` (section 20), not a static `app.json`.

---

## 5. PROJECT STRUCTURE

```
app/
  _layout.tsx            # providers, init pipeline, splash handling, stack config
  index.tsx              # Home
  game.tsx               # Game screen (params: mode=level|daily, level?)
  daily.tsx              # Daily challenge calendar + streak
  shop.tsx               # Coins, remove ads, starter pack, VIP, restore
  themes.tsx             # Theme/skin selection
  settings.tsx
src/
  game/      types.ts rules.ts rng.ts generator.ts solver.ts difficulty.ts stars.ts daily.ts levelCodec.ts levels.generated.ts
  render/    Board.tsx TubeLayer.tsx Liquid.tsx Stream.tsx Confetti.tsx Bubbles.tsx layout.ts palette.ts symbols.ts themes.ts useBoardAnimations.ts
  state/     progressStore.ts gameStore.ts settingsStore.ts migrations.ts
  services/  ads.ts ads.mock.ts adScheduler.ts consent.ts iap.ts iap.mock.ts fulfillment.ts notifications.ts notificationPlanner.ts
             audio.ts haptics.ts analytics.ts review.ts firebase.ts auth.ts cloudSave.ts
  i18n/      index.ts locales/{en,es,pt-BR,fr,de,it,ru,tr,id,ar,hi,ja,ko}.json
  ui/        Button.tsx IconButton.tsx CoinBadge.tsx Sheet.tsx Toast.tsx Overlay.tsx tokens.ts ...
  config/    economy.ts products.ts ads.ts constants.ts
  utils/     date.ts perf.ts logger.ts
shared/      products.ts (shared with functions/)
functions/   Cloud Functions (own package.json)
firebase/    firestore.rules
public/      Firebase Hosting: privacy-policy.html terms-of-service.html delete-account.html
assets/      generated by scripts, committed
scripts/     generate-assets.mjs generate-sounds.mjs generate-levels.ts
__tests__/
store-listing/   13 locale listing drafts
docs/        SPEC.md DECISIONS.md MANUAL_TEST_CHECKLIST.md STORE_CHECKLIST.md PRIVACY_POLICY.md FIREBASE_SETUP.md
app.config.ts eas.json tsconfig.json jest.config.js eslint.config.js .env.example README.md firebase.json .firebaserc
```

---

## 6. GAME RULES (EXACT)

- A **tube** holds up to `capacity` segments (default **4**). Index 0 is the bottom. A segment has a color id and a `hidden` flag.
- A **level** has `colors` distinct colors, each with exactly `capacity` segments, plus `emptyTubes` empty tubes (usually 2).
- **Selecting:** tap a non-empty, non-complete tube to select it (its top run lifts). Tapping it again deselects. Tapping another valid destination pours.
- **Valid pour A → B:** A ≠ B; A is non-empty and not complete; B is not full and not complete; and B is empty OR the top segment color of B equals the top segment color of A.
- **Amount poured:** the contiguous run of same-colored, revealed segments on top of A, limited to the free space in B: `count = min(runLength(A), capacity − len(B))`.
- **Mystery segments (level ≥ 25):** a segment below the top of a tube may be `hidden` (drawn as a neutral "?" tile). The top segment of every tube is ALWAYS revealed; when a pour exposes a hidden segment it flips to revealed (animated) permanently. Hidden segments never count toward a run.
- **Complete tube:** `len == capacity` and all one color. Complete tubes lock (cannot be source or destination), get a cap and a sparkle.
- **Win:** every non-empty tube is complete.
- **Stuck:** no legal pour exists other than pointless moves (moving a uniform tube onto an empty tube). When stuck, show the "No moves" overlay (offers Undo, +Tube, Restart, Skip via ad).
- **Undo:** reverts the last pour (including hidden-segment reveal state). 3 free undos per level, then costs coins or a rewarded ad.
- **Hint:** computes the next move with the solver and highlights source and destination with a pulsing glow. Consumes 1 hint from inventory.
- **+Tube:** adds one extra empty tube, once per level (coins or rewarded ad).
- **Restart:** resets the level instantly, no confirmation unless the player has used a paid resource this attempt.
- **Hard levels:** every 10th level has `emptyTubes = 1`, a crown badge, 2× coin reward, and mandatory-solvable validation.

---

## 7. LEVEL GENERATION, SOLVER, DIFFICULTY

### 7.1 Solver (`src/game/solver.ts`)
- Pure, deterministic, no React or platform imports. Worklet-compatible pure function where practical.
- Depth-first search with memoized visited states (canonical hash that sorts tubes), move ordering that prefers: completing a tube, pouring onto a same-color top, consolidating colors, avoiding pointless moves. Configurable node cap (default 200,000 for generation, 40,000 for in-game hints).
- Returns `{ solvable, moves[], nodes }`. Also supports "find a better solution" iteration to approximate a short par.
- Operates on TRUE colors (including hidden segments), so hints work on mystery levels.
- Must never block the JS thread for more than ~8 ms per slice during gameplay. Run hint computation off the JS thread using `react-native-worklets` (installed version's runtime scheduling API) or chunk the search with cooperative yields. Verify and document the approach.

### 7.2 Generator (`src/game/generator.ts`)
- Seeded PRNG (mulberry32 or sfc32) in `rng.ts`. Same seed → identical level on every device.
- Procedure: build solved tubes, shuffle all segments with the seeded PRNG into tubes (leaving `emptyTubes` empty), assign `hidden` flags per the difficulty ratio (never the top segment), then **validate with the solver**: solvable within the node cap, no tube complete at start, minimum solution length for the difficulty band, not trivially solved. On failure try `seed + 1`, up to 50 attempts; if all fail, fall back to a conservative config (one extra empty tube). Record `par` (best found solution length).
- Never ship an unvalidated level.

### 7.3 Difficulty (`src/game/difficulty.ts`) — `getLevelConfig(level)`
| Levels | Colors | Empty tubes | Hidden ratio | Notes |
|---|---|---|---|---|
| 1–3 | 3 | 2 | 0 | tutorial, guided |
| 4–10 | 4–5 | 2 | 0 | |
| 11–24 | 6–8 | 2 | 0 | |
| 25–60 | 8–10 | 2 | 0.10 → 0.30 | mystery introduced at 25 |
| 61–150 | 10–12 | 2 | 0.20 → 0.35 | |
| 151+ | 12–14 | 2 | 0.30 → 0.40 | max 16 tubes total |
Every 10th level: `hard = true`, `emptyTubes = 1`. Smooth monotonic ramp inside each band.

### 7.4 Precomputed levels (`scripts/generate-levels.ts`)
- Generates and validates levels **1–300**, writes `src/game/levels.generated.ts` using a **compact string encoding** (`levelCodec.ts` encodes/decodes one level; decode lazily on demand).
- Levels above 300 are generated at runtime with the same generator, **one level ahead** while playing (scheduled with `requestIdleCallback` in small slices).
- Script `gen:levels`. A test must re-verify all precomputed levels with the solver.

### 7.5 Stars (`stars.ts`)
`par` = best known solution length. 3★ if `moves ≤ ceil(par × 1.4)`, 2★ if `moves ≤ ceil(par × 2.0)`, else 1★. Hints do not affect stars.

### 7.6 Daily challenge (`daily.ts`)
Seed = hash of the player's LOCAL date string `YYYY-MM-DD` plus a constant salt. Difficulty mid-high (colors 8–10, mystery on). Generated and validated at runtime off the critical path. One reward per calendar day. Guard against clock rollback (if `now < lastSeenAt`, grant nothing and keep state).

---

## 8. RENDERING AND ANIMATION

### 8.1 Architecture
- **One full-screen `@shopify/react-native-skia` Canvas** draws background, tubes, liquid, streams, particles, effects. HUD buttons and overlays are normal RN views above it (`pointerEvents="box-none"`).
- Board geometry comes from pure `layout.ts`.
- Tap handling uses Gesture Handler. A tap starts the select/lift animation **on the UI thread in the same frame**; the JS store remains the source of truth and is mirrored to a shared value after each committed move. Use `scheduleOnRN` from `react-native-worklets` to call back into JS (`runOnJS` deprecated in Reanimated 4; confirm installed API).

### 8.2 Layout algorithm (`layout.ts`, pure, unit-tested)
Inputs: board area (w, h, safe insets), tube count N, capacity. Rows: N ≤ 5 → 1 row; N ≤ 12 → 2 rows; else 3. Columns = ceil(N / rows); center a short last row. Tube width = min(maxWidth, (w − gaps) / cols); tube height from segment height with an aspect clamp; every tube hit rect ≥ 44 dp wide and the whole board fits inside the area. Export `getTubeRects()` and `hitTest(x, y)`. Phones, tablets, foldables. Portrait locked.

### 8.3 Visual design
- **Background:** vertical gradient per theme, plus up to 12 slow floating bubbles (disabled in low quality and reduced motion).
- **Tube:** glass look — rounded-bottom tube path, thin light rim (white ~22%), left-edge vertical highlight strip (~18%), subtle inner shadow, soft shadow beneath.
- **Liquid segment:** rounded rect with vertical gradient (top +12% lighter → base → bottom −10% darker), 1 px lighter inner stroke; bottom segment follows the tube's rounded bottom; top segment gets an elliptical surface highlight.
- **Mystery segment:** neutral slate tile with a "?" drawn as a Skia path; flip animation (scaleX 1→0→1 with color swap at midpoint) on reveal.
- **Selected tube:** lifts ~14 dp with a spring and a soft glow ring. Glow only for the selected tube.
- **Pour:** source tube arcs above destination, tilts proportional to poured amount (up to ~75°), a narrow rounded stream (≈6 dp) from lip to destination surface, source level drops and destination rises while the stream is visible, then the source returns. Duration = `280 ms + 90 ms × segmentsMoved`, return 220 ms.
- **Tube complete:** cap drops on with squash-and-stretch bounce, 8–12 sparkle particles.
- **Level win:** staggered tube glow, confetti (max 60 particles), then win overlay.
- **Invalid move:** horizontal shake (±4 dp, 120 ms) plus error haptic and sound.
- **Hint:** pulsing glow on source and destination tubes.
- **Color-blind mode:** each color draws a unique white (70% opacity) symbol centered in its segments (14 shapes: circle, square, triangle, diamond, star, plus, cross, heart, moon, drop, hexagon, pentagon, bolt, ring) as Skia paths in `symbols.ts`.

### 8.4 Palette (`palette.ts`)
14 base colors: `#FF4D6D, #FF9F1C, #FFD60A, #7ED957, #00C2A8, #2EC4FF, #3A6BFF, #8B5CF6, #E056FD, #FF7BAC, #A47148, #C6F432, #EAF6FF, #8C1C3B`.
Unit test: all pairwise CIE76 (Lab) distances ≥ 15; adjust the palette until it passes.

### 8.5 MANDATORY PERFORMANCE TECHNIQUES
1. No React state updates during animations. Reanimated shared values feed Skia (`useDerivedValue`). Commit logical state only at animation boundaries.
2. Create `Paint`, shaders, gradients, `SkPath` once (memoized per layout/theme), never per frame.
3. Cache static layers (background gradient, tube glass frames) (Skia `Picture`/cached image or equivalent).
4. Blur/glow only on the selected tube and active effects.
5. Cap particles (confetti ≤ 60, sparkles ≤ 12 per tube).
6. **Adaptive quality:** frame-time monitor (`useFrameCallback`); if average > ~20 ms over 3 s, switch to `quality = 'low'` (no bubbles/glow, half particles) and persist. Settings "Performance mode" (Auto / High / Low).
7. Preload assets, sounds, and level data before first interaction; never allocate during a pour.
8. Memoize components; narrow Zustand selectors.
9. Dev-only FPS overlay (`src/utils/perf.ts`) toggled by long-pressing the level title in `__DEV__`.
10. Dev-only stress screen (16 tubes, 14 colors, repeated pours).
11. Respect OS reduced motion: durations ×0.4, no bubbles or confetti.

---

## 9. GAME STATE MACHINE AND FLOW

States: `idle → selected → pouring → (won | stuck | idle)`. Input during `pouring` is queued (queue length 1). A pour commits logical state at its start; the animation catches up visually.

- **Persistence:** save the in-progress board (debounced, on every committed move and on app background) so the player resumes exactly after kill/relaunch.
- **First launch:** straight to level 1. Levels 1–3 show text-free guided hints (animated finger pointing to the correct tube pair) plus one short localized caption.
- **Hardware back (Android):** on the game screen opens the Pause overlay.
- **Win:** compute stars, grant coins, update progress, evaluate streak, show win overlay (stars animate sequentially, coin counter ticks up; buttons: Next (primary), Double coins ▶ (rewarded ad), Home). Pre-generate/pre-decode the next level during the win animation.
- **Interstitial** only when the player taps Next.

---

## 10. SCREENS AND UX

All screens use theme tokens and dark/light status bar per theme. All text through i18n. All interactive elements have accessibility labels and 44 dp targets.

1. **Home:** animated title; large Play button ("Level N"); small Skia hero animation of three tubes pouring in a loop; Daily Challenge card (flame + streak; "Play" or "Done ✓"); Daily Gift button (pulses when claimable); Starter Pack banner with persisted 72-hour countdown (after level 8 if not purchased and not expired); bottom row: Shop, Themes, Settings; coin badge top right (→ Shop). Resume banner if a level is in progress. Sign-in card (section 26.2).
2. **Game:** top bar (pause, "Level N" with crown for hard levels, coin badge), board, bottom action bar: Undo (count badge), Hint (count badge), Restart, +Tube (ad icon when it would use a rewarded ad). Overlays (components, not routes): Pause, Win, Stuck, Reward, Notification soft-prompt, Not-enough-coins (offers ad or Shop).
3. **Daily:** month calendar with completed days, current streak, longest streak, today's Play button, Day-7 chest progress.
4. **Shop:** coin packs (3), Remove Ads, Starter Pack, VIP (weekly/monthly) with benefits list, "Free coins ▶" rewarded ad (cooldown 5 min, max 5/day), Restore Purchases, Manage Subscription link, Terms and Privacy links. Prices from the store (`priceString`).
5. **Themes:** preview cards; owned/locked; unlock with coins; VIP-exclusive theme; applying updates the board instantly.
6. **Settings:** Sound; Haptics; Notifications (daily, streak); Language (System + 13); Color-blind symbols; Reduced motion (System/On/Off); Performance mode (Auto/High/Low); Account (section 26.2); Restore Purchases; Manage Subscription; Ad privacy options (only when UMP says required); Privacy Policy and Terms; Contact support (mailto); Reset progress (double confirm); version/build.

Themes (`themes.ts`): **Classic** (free), **Midnight**, **Sunset**, **Mint**, **Candy**, **Neon** (coins 300–1000), **Aurora** (starter pack), **Gold** (VIP). Each defines background gradient, tube style, glow color, UI accent.

---

## 11. META SYSTEMS AND ECONOMY (`src/config/economy.ts`)

```ts
export const ECONOMY = {
  startCoins: 100, startHints: 3, startExtraTubes: 1,
  freeUndosPerLevel: 3, undoCost: 10, hintCoinCost: 25, extraTubeCost: 40,
  winBase: 10, winBonus2Star: 3, winBonus3Star: 6, hardLevelMultiplier: 2,
  dailyChallengeCoins: 40, streakBonusPerDay: 2, streakBonusCap: 20,
  dailyGiftCycle: [
    { coins: 20 }, { hints: 1 }, { coins: 30 }, { undos: 2 },
    { coins: 50 }, { hints: 2 }, { coins: 150, hints: 3, extraTubes: 3 }, // day 7 chest
  ],
  vipMultiplier: 2, vipDailyCoins: 100, vipDailyHints: 3,
  freeCoinsAdReward: 50, freeCoinsAdCooldownSec: 300, freeCoinsAdDailyMax: 5,
  doubleCoinsOnWin: true,
  themePrices: { midnight: 300, sunset: 400, mint: 500, candy: 700, neon: 1000 },
};
```
- **Streak:** consecutive local days with a completed daily challenge. Missing a day resets to 0 (VIP: one automatic streak freeze per week).
- **Inventory:** coins, hints, undos, extra tubes — persisted.
- All economy math in pure, unit-tested functions.

---

## 12. IN-APP PURCHASES (RevenueCat)

- `react-native-purchases` behind a provider abstraction in `iap.ts`, full **mock** in `iap.mock.ts` (used in Expo Go and when keys are missing in development; simulates success/cancel/failure with clearly labeled "TEST PURCHASE" UI). In a RELEASE build with missing keys, disable purchases gracefully (Shop "unavailable" state), never crash.
- Initialize lazily after first frame. Listen to customer-info updates; re-sync on foreground (throttle 1/min).
- **Products (`products.ts`):** consumables `coins_500`, `coins_1500`, `coins_4000`; non-consumable `remove_ads` (entitlement `no_ads`); one-time `starter_pack` (1500 coins, 10 hints, 10 undos, Aurora theme; no ad removal); subscriptions `vip_weekly`, `vip_monthly` (entitlement `vip`). Offering `default`.
- **VIP:** no interstitials, 2× daily gift, +100 coins and +3 hints daily (once per day), Gold theme, VIP badge, one streak freeze per week.
- **Fulfillment (`fulfillment.ts`):** grant consumables exactly once per transaction id (persist last 200). Handle cancelled, pending, already-owned, network errors with localized toasts. Entitlements derive from RevenueCat customer info.
- **Restore Purchases** re-syncs entitlements; UI explains consumables are not restorable.
- Subscription UI shows price, billing period, auto-renewal note, Terms/Privacy links. Prices from `product.priceString`.
- Note in DECISIONS.md that client-side coin balances are spoofable and why acceptable for v1.

---

## 13. ADS (AdMob via `react-native-google-mobile-ads`)

- Abstraction in `ads.ts`, mock in `ads.mock.ts` (full-screen "TEST AD (mock)" overlay, 3-second countdown, reward callback). Real ads use `TestIds` when `__DEV__`, production unit IDs from env otherwise. If production IDs are missing in a release build, disable ads and log a warning.
- **Formats:** Rewarded and Interstitial only. No banners.
- **Rewarded placements:** `HINT`, `UNDO`, `EXTRA_TUBE`, `DOUBLE_COINS`, `DAILY_GIFT_X2`, `FREE_COINS`, `SKIP_LEVEL`. Grant ONLY on earned-reward event. `SKIP_LEVEL` appears when stuck, after 3 restarts of the same level, or after 2 minutes on one level; counts as completed with 1 star and no coins.
- **Interstitial rules (`adScheduler.ts`, pure, injected clock):** only on Next; never before level 6; every 3rd completed level; ≥ 120 s since last interstitial; ≥ 60 s since last rewarded; never in first 5 minutes of the very first session; never for VIP or `no_ads`; never in the stuck flow.
- **Preloading:** one rewarded + one interstitial; reload after each show; exponential backoff on failure (cap 60 s). If none ready, localized "Ad not ready, try again soon" toast; never block.
- **Audio:** pause game sounds while an ad shows.
- **Consent (`consent.ts`):** (1) do not initialize ads until after first frame and after the player reaches level 5 start; (2) run Google UMP (`AdsConsent` request-info-update, load and show form if required); initialize Mobile Ads only when `canRequestAds`; (3) Settings shows "Ad privacy options" only when UMP says required; (4) max ad content rating PG, non-child-directed.
- Dev sample app ID: Android `ca-app-pub-3940256099942544~3347511713`.

---

## 14. NOTIFICATIONS (local scheduled, `expo-notifications`)

- **Permission:** never on launch. After winning level 3, custom soft-prompt sheet; only on "Allow" call the system request. If dismissed, ask once more after level 15. Handle Android 13+ runtime permission; create channel `reminders` (importance default) before scheduling. Small monochrome icon and accent color.
- **Planner (`notificationPlanner.ts`, pure, injected clock):** returns notifications for the next 7 days:
  - `streak_risk` 20:00 local when streak ≥ 2 and today's daily not done.
  - `daily_ready` 10:30 local when today's daily not done.
  - `gift_ready` 18:00 local when daily gift unclaimed.
  - Comeback series from `lastOpenAt`: +24 h, +72 h, +7 d, +14 d with escalating copy, then stop.
  - Caps: ≤ 1 per local day (priority streak_risk > daily_ready > gift_ready > comeback); never 22:00–08:00 local; respect Settings toggles.
- **Scheduler (`notifications.ts`):** on every foreground (and relevant state changes) cancel all and reschedule. Typed DATE triggers. Strings localized at scheduling time. Recompute on foreground for TZ/DST.
- **Tap handling:** deep link `pourly://` to Daily (daily/streak/gift) or Home (comeback). Foreground notifications suppressed.
- Copy under `notifications.*` in locale files with `{{n}}` interpolation.

---

## 15. AUDIO AND HAPTICS

- **Audio (`expo-audio`):** preload a pool (2 per effect). Sounds: `select`, `pour`, `drop`, `complete`, `win`, `error`, `tap`, `coin`. Mix with other apps, respect silent mode. No music. Dispose on unmount and background.
- **`scripts/generate-sounds.mjs`** (pure Node): 16-bit PCM mono 44.1 kHz WAVs — select (880 Hz blip 60 ms), pour (band-limited noise with rising bubbly pitch ~300 ms, fades), drop (440→330 Hz thud 120 ms), complete (C–E–G arpeggio ~250 ms), win (rising fanfare ~600 ms), error (low buzz 120 ms), tap (30 ms click), coin (high ping with decay). Each < 80 KB.
- **Haptics (`expo-haptics`):** selection on select, light impact at pour start, success on tube complete and win, error on invalid move, medium on button presses (sparingly). Behind Settings toggle.

---

## 16. I18N, RTL, ACCESSIBILITY

- **Languages (13):** en, es, pt-BR, fr, de, it, ru, tr, id, ar, hi, ja, ko. Never ship a partial locale.
- `i18next` + `react-i18next` + `expo-localization`. Device language, fall back to English, in-app override persisted. ~150 keys, natural concise translations, marked machine-drafted in DECISIONS.md.
- `Intl.NumberFormat` for numbers; `priceString` for money. Plurals via i18next.
- **RTL (Arabic):** logical start/end props; **board container forced LTR**; no hard-coded left/right in UI chrome.
- System font only.
- **Accessibility:** labels/roles on every button, modal focus handling, 44 dp targets, color-blind mode, reduced motion, WCAG AA text contrast.

---

## 17. STATE, PERSISTENCE, DATA MODEL

Zustand 5 with `persist` + `createJSONStorage(() => AsyncStorage)`, store `version`, `migrations.ts` with tested migrations. Narrow selectors.

```ts
export interface ProgressState {
  schemaVersion: number;
  installDate: string; lastOpenAt: number; lastSeenAt: number; sessionCount: number;
  level: number;                              // next level to play
  stars: Record<number, 1 | 2 | 3>;
  coins: number; hints: number; undos: number; extraTubes: number;
  streak: number; bestStreak: number; lastDailyDate: string | null;
  dailyHistory: Record<string, { stars: number; moves: number }>;
  giftDayIndex: number; lastGiftDate: string | null; lastVipClaimDate: string | null;
  streakFreezeWeek: string | null;
  ownedThemes: string[]; activeTheme: string;
  entitlements: { noAds: boolean; vip: boolean };
  processedTransactions: string[];            // last 200
  starterPackExpiresAt: number | null; starterPackPurchased: boolean;
  ads: { lastInterstitialAt: number; lastRewardedAt: number; levelsSinceInterstitial: number;
         freeCoinsClaimsToday: number; freeCoinsDate: string | null; lastFreeCoinsAt: number };
  notifications: { asked: boolean; askedCount: number; granted: boolean;
                   dailyEnabled: boolean; streakEnabled: boolean };
  review: { lastPromptAt: number; promptCount: number; threeStarStreak: number };
  tutorialDone: boolean;
}
export interface SettingsState {
  sound: boolean; haptics: boolean; colorBlind: boolean;
  reducedMotion: 'system' | 'on' | 'off'; quality: 'auto' | 'high' | 'low';
  language: 'system' | string;
}
```
`gameStore`: current board, move history (undo), selected tube, counters (moves, undos used, hints used, extra tube used), level id/mode, debounced resume snapshot. Section 26 adds cloud-sync fields (e.g. `lastSyncedBalances`, `updatedAt`).

---

## 18. ANALYTICS (abstraction only)

`analytics.ts`: `track(event, params)` with adapter interface; default logs in `__DEV__`, no-op in production. README explains plugging in Firebase Analytics later. Typed events: `app_open`, `level_start`, `level_complete`, `level_stuck`, `level_restart`, `hint_used`, `undo_used`, `extra_tube_used`, `ad_rewarded_requested`, `ad_rewarded_earned`, `ad_interstitial_shown`, `ad_load_failed`, `shop_opened`, `iap_started`, `iap_success`, `iap_failed`, `notification_prompt_result`, `daily_started`, `daily_completed`, `streak_extended`, `theme_unlocked`, `setting_changed`, `tutorial_step`.

---

## 19. REVIEW PROMPT

`review.ts` (`expo-store-review`): only after 3★ on 3 levels in a row at level ≥ 10, at most once per 60 days, at most 3 times total, never right after an ad.

---

## 20. CONFIGURATION

### 20.1 `app.config.ts`
Name `Pourly`, slug `pourly`, scheme `pourly`, version `1.0.0`, portrait only, icons/splash from `assets/`, `userInterfaceStyle: 'automatic'`. Package from env `ANDROID_PACKAGE`, default `com.pourly.water.app` (README: permanent once published).
Plugins: `expo-router`, `expo-splash-screen`, `expo-build-properties` (Android release minify + shrink resources), `expo-notifications` (small icon + color), `expo-localization`, `["react-native-google-mobile-ads", { androidAppId from env, sample ID as dev default }]`, `@react-native-google-signin/google-signin`, `expo-dev-client`. New Architecture enabled.

### 20.2 `eas.json`
`development` (developmentClient, internal, APK), `preview` (internal, APK, release-mode perf testing, test ad IDs), `production` (store, AAB, `autoIncrement`). `cli.appVersionSource: "remote"`.

### 20.3 `.env.example`
```
ANDROID_PACKAGE=com.pourly.water.app
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=ca-app-pub-3940256099942544~3347511713
EXPO_PUBLIC_ADMOB_REWARDED_ANDROID=
EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID=
EXPO_PUBLIC_PRIVACY_URL=https://example.com/privacy
EXPO_PUBLIC_TERMS_URL=https://example.com/terms
EXPO_PUBLIC_SUPPORT_EMAIL=support@example.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
# Firebase JS SDK config (see DECISIONS.md)
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```
AdMob app IDs are baked into the native manifest at prebuild; `app.config.ts` reads them at build time.

---

## 21. ASSET GENERATION (procedural)

- `scripts/generate-assets.mjs` (`sharp`): `icon.png` (1024, gradient background with three glossy tubes of colored liquid), `adaptive-icon-foreground.png`, `adaptive-icon-monochrome.png` (Android safe zone), `splash-icon.png`, `notification-icon.png` (96×96 white-on-transparent), `favicon.png`. Wired in `app.config.ts`.
- `scripts/generate-sounds.mjs` (section 15).
- Scripts: `gen:assets`, `gen:sounds`, `gen:levels`, `gen:all`. Run and commit outputs.

---

## 22. TESTING AND VERIFICATION

**Jest + jest-expo, ≥ 40 test cases:**
1. `rules`: valid/invalid pours, partial pours, run length, hidden reveal, completion locking, win, stuck, undo restores exactly.
2. `solver`: solves known puzzles, unsolvable correctly, node cap, hash canonicalization.
3. `generator`/`levels`: determinism; difficulty monotonic; **all 300 precomputed levels re-verified solvable**; codec round-trips.
4. `daily`: same date → same board; streak consecutive, missed day, timezone change, backwards clock.
5. `economy`: win rewards, costs, double coins, gift cycle, VIP multiplier.
6. `adScheduler`: every cadence rule incl. first-session protection and VIP/no_ads.
7. `notificationPlanner`: 1/day cap, quiet hours, priority, comeback series, DST day, toggles off.
8. `i18n`: every locale has exactly English's keys, no empty values, placeholders preserved.
9. `palette`: pairwise Lab distance ≥ 15.
10. `layout`: tubes inside bounds for many (N, screen) combos, ≥ 44 dp targets, `hitTest` inverts placement.
11. `migrations` and `fulfillment` (idempotent grants).
12. Section 26.8 tests.

**Commands that must succeed:**
```bash
yarn tsc --noEmit
yarn eslint .
yarn jest --ci
npx expo-doctor
npx expo export --platform android
npx expo prebuild --no-install --platform android --clean
```
Plus a local Android debug build (`cd android && ./gradlew assembleDebug`). Native folders stay gitignored (CNG).

**`docs/MANUAL_TEST_CHECKLIST.md`:** low-end Android release build (fps on a 14-color level, pours, confetti, modals, memory over 20 min), kill/relaunch resume, airplane mode, ads (rewarded earn/skip/no-fill, interstitial cadence, consent on an EEA test device via UMP debug geography), purchases (sandbox purchase, cancel, restore, subscription), notifications (permission, deep links, TZ change), RTL Arabic, color-blind, reduced motion, 360 dp phones, tablets, 2-hour battery/thermal soak, Google sign-in / cloud save / account deletion.

---

## 23. DOCUMENTATION

- `README.md`: overview, setup, env, scripts, dev build, release-mode perf testing, resolved versions, architecture.
- `docs/DECISIONS.md`: every ambiguity and deviation.
- `docs/STORE_CHECKLIST.md`: Play Console data-safety (AdMob advertising ID, RevenueCat purchase data, Google account email and user id, game progress; see 26.7), content rating, ads declaration, IAP product creation with exact ids, RevenueCat setup (entitlements `no_ads`, `vip`; offering `default`), AdMob app/ad units, EEA/UK consent, account deletion web URL, release steps.
- `docs/PRIVACY_POLICY.md`: template matching real data practices.
- `docs/FIREBASE_SETUP.md` (section 26).
- `store-listing/<locale>.md` × 13: title (≤ 30, keep "Pourly", localize keyword part), short description (≤ 80), full description (≤ 4000), keyword suggestions. Marked drafts needing native review.

---

## 24. BUILD ORDER — see the approved plan phases (11 phases, owner reviews after each).

---

## 25. DEFINITION OF DONE

- All section 22 commands pass; ≥ 40 tests green.
- App launches straight into a playable level 1 with mock ads/IAP when no keys are set; every flow (win, stuck, undo, hint, +tube, daily, shop, themes, settings, language switch, notification soft-prompt, sign-in when configured) is reachable and functional.
- No TODOs, dead code, placeholder text, unused dependencies.
- `docs/` and `store-listing/` complete.
- Final report: what was built, resolved versions, what was verified automatically, what still needs a device check.

---

## 26. FIREBASE BACKEND AND GOOGLE SIGN-IN (ANDROID ONLY)

**Goal:** optional Google sign-in so progress and purchases follow the player across devices, and RevenueCat purchases are tied to a stable user id (Firebase UID). The game works fully as a guest.

### 26.1 Packages and setup
- Firebase JS SDK (`firebase`) + `@react-native-google-signin/google-signin` (owner decision; see DECISIONS.md). Config from `EXPO_PUBLIC_FIREBASE_*`. If config is missing, auth and cloud features switch to a clearly logged "disabled" mode and the game still runs; a release build with missing config must not crash.
- `docs/FIREBASE_SETUP.md`: create the Firebase project, enable Google provider, add Android app with package `com.pourly.water.app`, add SHA-1 and SHA-256 for the EAS upload key, Play App Signing key, and the debug key; copy the Web client id; enable Blaze; deploy rules/functions/hosting; set Functions secrets.

### 26.2 Auth behavior (`src/services/auth.ts`)
- Auth state `guest` or `signedIn`. App start never waits for the network. No login wall.
- Settings Account section (Sign in with Google / Sign out / Delete account and data). Home shows a small dismissible "Sign in to save your progress" card after level 5 and after the first purchase.
- Flow: `GoogleSignin.signIn()` → id token → `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`. Handle cancel, no Play Services, network errors with localized toasts.
- **Account deletion** (Google Play requirement): in-app flow re-auths with Google, then calls the authenticated `deleteMyAccount` callable which recursively deletes `users/{uid}` and the Auth user. The Hosting `delete-account.html` page signs in with Google (Firebase web Auth) and calls the same function.

### 26.3 RevenueCat identity
- On sign-in `Purchases.logIn(firebaseUid)`; on sign-out `Purchases.logOut()`. Guests use anonymous ids; guest purchases transfer to the account at sign-in (document the RevenueCat transfer setting).
- Entitlements (`no_ads`, `vip`) always from RevenueCat customer info.

### 26.4 Cloud save (Firestore `users/{uid}`)
- Versioned snapshot of `ProgressState` (no secrets): level, stars, coins, hints, undos, extraTubes, streak data, ownedThemes, activeTheme, processedTransactions, updatedAt, `schemaVersion`.
- `cloudSave.ts` with a pure, unit-tested merge function: push (debounced, ≤ once per 30 s and on background) after meaningful changes; on sign-in pull and **merge**: highest `level`, per-level max stars, union of owned themes and processed transactions, max of streak and bestStreak, consumable balances = server value + local delta since last sync (`lastSyncedBalances`). Never lose purchased value; on conflict prefer the larger player-favorable value and log.
- Offline: pending pushes queue in the persisted Zustand store (JS SDK has no RN offline persistence); failures never block gameplay.

### 26.5 Server-side purchase fulfillment (Cloud Functions)
- `functions/` (TypeScript, Node 22, Functions v2) with HTTPS `revenuecatWebhook`: verify Authorization header (secret), handle `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`, `REFUND`; map product id to a grant via the shared `products` table; write grants to `users/{uid}/grants/{transactionId}` in a Firestore transaction (idempotent). REFUND of consumables writes a negative grant; balances floor at 0. `TRANSFER` never grants. The app listens to its grants and applies each unseen grant once, then marks it `applied`.
- Guests fulfilled client-side (section 12). Signed-in purchases are server-fulfilled only. Both keyed by store transaction id so `processedTransactions` dedupes.
- **Billing note (prominent in docs):** Cloud Functions require the Blaze plan. `USE_SERVER_FULFILLMENT` in `src/config/constants.ts` (default true) falls back to client-side fulfillment for everyone when false; implement and test both.
- `deleteMyAccount` callable: uses `request.auth.uid` only; `recursiveDelete(users/{uid})` then `auth.deleteUser(uid)`.

### 26.6 Security rules (`firebase/firestore.rules`)
- `users/{uid}`: read/write only when `request.auth.uid == uid`; validate field types and cap sizes; clients cannot create/delete `grants`; clients may update only the `applied` flag on their own grants.
- `firebase.json` (firestore rules, functions, hosting `public/`), `.firebaserc` placeholder; rules unit tests with the emulator if feasible, otherwise documented manual verification.

### 26.7 Privacy and compliance
- Privacy policy and Play Data Safety: email and user id (Google sign-in), game progress, advertising id (AdMob), purchase history (RevenueCat); encrypted in transit; users can delete account and data (in-app and web).
- No Firebase Analytics or Crashlytics in v1 (Crashlytics noted as optional later).

### 26.8 Tests
Merge function (all conflict cases), grant idempotency, auth state transitions with a mocked auth service, RevenueCat `logIn`/`logOut` on sign-in/out, guest-to-account purchase continuity, `USE_SERVER_FULFILLMENT` fallback. Count toward ≥ 40.
