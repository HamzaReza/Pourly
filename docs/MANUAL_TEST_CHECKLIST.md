# Manual device test checklist

What the automated suites cannot prove (spec §0.2, §22): run this on real Android hardware before
each store release. Nothing here has been verified on a device yet; tick items only after measuring
them. Record the device, Android version, build profile and app version for each run.

**Builds**

- **Release-mode checks** (performance, ads timing, purchases): `eas build --platform android
--profile preview` (release mode, Google test ad units, `EXPO_PUBLIC_ADS_USE_TEST_IDS=true`). For
  real purchases and Google sign-in from Play, use a `production` AAB on the **internal testing**
  track, installed from Play by a license tester.
- **Dev-only tools** (FPS overlay, stress screen, UMP debug geography): a development build
  (`yarn android` or `eas build --profile development`).

**Devices**

- [ ] Low-end: Snapdragon 6-series class (or Helio G85 / Unisoc T606 class), 3–4 GB RAM, Android 10–12
- [ ] Mid/high-end phone, Android 14+ (Android 13+ notification permission)
- [ ] Small phone, **360 dp** wide (and a 320 dp emulator for layout)
- [ ] 10-inch tablet (and a 7-inch if available)
- [ ] A foldable (or the Android Studio resizable/foldable emulator)
- [ ] An emulator in the EEA debug geography for consent

## 1. Performance (release build, low-end device)

Use the `preview` APK. Measure with `adb shell dumpsys gfxinfo com.pourly.water.app framestats`
(reset with `dumpsys gfxinfo … reset` before each scenario) or Android Studio's profiler; target a
steady 60 fps (16.7 ms frames), no janky frames during the listed moments.

- [ ] A **14-colour / 16-tube** level (levels 251+; or a hard level near 300): idle board, select,
      deselect, invalid-move shake: no dropped frames
- [ ] **Pours**: rapid consecutive pours (queue a tap during a stream), long pours (4 segments),
      pours that reveal a hidden segment, tube completion cap + sparkles
- [ ] **Win sequence**: per-tube glow, confetti (60 particles), Win overlay count-up
- [ ] **Modal transitions**: Pause sheet, Stuck, Win, Reward, Not-enough-coins, Restart confirm,
      notification soft-prompt, screen pushes (Shop, Themes, Settings, Daily)
- [ ] Home hero animation runs smoothly and pauses when Home loses focus
- [ ] Touch to visible feedback within one frame (selection lift starts on finger up)
- [ ] Hint on a 14-colour board: the solver's chunked search (8 ms slices, measured 8.19 ms max on
      an M1 Pro, DECISIONS P2.2) causes no visible hitch on the low-end device
- [ ] **Memory over 20 minutes** of continuous play (`adb shell dumpsys meminfo com.pourly.water.app`
      every 5 min): no steady growth of Java/Native/Graphics heap; no OOM
- [ ] Theme switches and colour-blind toggles during play rebuild pictures without a hitch
- [ ] **Canvas surface** (DECISIONS P3.14): the board canvas is not `opaque`; confirm stack
      transitions look right and profile whether an opaque `SurfaceView` would help
- [ ] **Auto quality downgrade** (DECISIONS P4.10): with Performance mode = Auto on the low-end
      device, if frames average > 20 ms over 3 s the effects drop (no bubbles, no glow blur, half
      particles) and Settings shows the "Auto lowered effects" note; choosing High/Low clears it,
      choosing Auto again re-measures
- [ ] Performance mode Low and High each look and perform as expected

**Dev build tools**

- [ ] **FPS overlay**: long-press the level title on the game screen (dev builds only); readings
      match the profiler roughly
- [ ] **Stress screen** (`app/dev-stress.tsx`, Home → dev button, dev builds only): 16 tubes, 14
      colours, automatic pours every 420 ms for 5 minutes; FPS overlay steady, no crash, new board
      when stuck
- [ ] Neither tool is reachable in the `preview` build

## 2. App lifecycle and connectivity

- [ ] **Launcher icon**: the three-tube icon on the home screen and app drawer under the launcher's
      mask (circle, squircle or rounded square: Pixel and Samsung launchers); nothing clipped, the
      tubes centered; with Android 13+ themed icons on, the monochrome tube silhouette shows
- [ ] **Splash**: navy background with the centered tube mark on a cold start (Android 12+ and
      an Android 10–11 device), in light and dark system mode; no white flash before the first
      screen

- [ ] **Cold start** (fresh install, release build): splash → playable level 1 in **< 3 s** (measure
      with a screen recording or `adb shell am start -W`); no onboarding screens
- [ ] **Next level** after a win: board ready in **< 500 ms**, no spinner (also on a runtime level > 300)
- [ ] **Restart** under 300 ms
- [ ] **Kill and relaunch mid-level** (swipe away / `adb shell am force-stop`): the same level
      resumes with the same board, reveal state, moves and undo history; the clock was stopped
- [ ] Kill mid-**daily**: the daily resumes from its own slot; the level slot is untouched (and vice
      versa)
- [ ] Kill during the win animation: the win, stars and coins are kept (granted at the winning
      pour); the next level opens
- [ ] Background mid-level and return: Pause overlay shows; a real AdMob ad does **not** trigger the
      pause (DECISIONS P7.14)
- [ ] **Airplane mode** from a fresh install: the whole game (levels, daily, gifts, themes with
      coins, settings, language) works; Shop shows "Store unavailable" with Try again; rewarded
      buttons show "Ad not ready"; nothing hangs or crashes
- [ ] Airplane mode while signed in: play, then reconnect; the pending cloud push goes out on the
      next foreground or within a minute (no connectivity listener, DECISIONS P9.14)
- [ ] Device clock moved backwards a day: no extra gift, free-coins or daily reward

## 3. Ads (AdMob)

Use the `preview` APK (test units) unless noted. Ads start only after the player reaches level 5.

- [ ] Before level 5: rewarded buttons say "Ad not ready"; no AdMob request in logcat
- [ ] At level 5 start: consent flow runs (outside the EEA: no form), AdMob initializes
- [ ] **Rewarded – earn**: watch to the end for each placement (Hint, Undo, +Tube, Double coins,
      Daily gift ×2, Free coins, Skip level); the reward is granted once, game sounds pause and
      resume
- [ ] **Rewarded – skip**: close early: no reward, no crash, the board is unchanged
- [ ] **Rewarded – no fill**: airplane mode after load failure, or a fresh install with no network:
      "Ad not ready, try again soon" toast; retries back off up to 60 s
- [ ] Earned reward while the board changed underneath goes to the inventory (Reward overlay)
- [ ] **Interstitial cadence**: never after levels 1–5; never in the first 5 minutes of the very
      first session; at most every 3rd completed level, ≥ 120 s apart and ≥ 60 s after a rewarded
      ad; only on Next (never after a daily, a skip or the stuck flow)
- [ ] Remove Ads or VIP active: no interstitials; rewarded ads still offered
- [ ] **UMP consent form** (dev build, emulator): set `EXPO_PUBLIC_UMP_DEBUG_EEA=true`, reinstall,
      reach level 5: the GDPR form appears (requires the published AdMob GDPR message); "Consent"
      and "Do not consent" both continue the game; with no consent, non-personalised ads or none
- [ ] **Ad privacy options**: in the EEA debug geography, Settings shows "Ad privacy options"; it
      reopens the form and a withdrawn consent switches ads off without a restart; outside the EEA
      the row is hidden
- [ ] Physical device in the EEA (real geography) with production build: form shows once
- [ ] Production build: real ad units serve (do not click them); no test-ad label

## 4. Purchases (RevenueCat, Google Play sandbox)

Install from the internal track as a **license tester**. Check RevenueCat → Customers after each.

- [ ] Shop prices are the store's localized `priceString`; subscription rows show billing period,
      auto-renewal note and Terms/Privacy links (links open the Hosting pages)
- [ ] **Purchase** `coins_500` as a guest: Reward overlay, +500 coins, transaction recorded once
- [ ] **Cancel** in the Play sheet: silent, nothing granted
- [ ] **Pending** (license tester "Slow test card, approves after a few minutes"): "Purchase
      pending…" toast, later "Your pending purchase is complete!" and a single grant (also after
      killing the app in between)
- [ ] Declined test card: store error toast
- [ ] **Remove Ads**: toast, interstitials stop; buying again → "already owned" overlay with Restore
- [ ] **Starter Pack** (after level 8, within its 72 h window): 1500 coins, 10 hints, 10 undos,
      Aurora unlocked; banner and Shop card disappear; a second purchase is impossible or grants
      nothing
- [ ] **Subscription** `vip_weekly` then `vip_monthly` (upgrade/downgrade): VIP badge, Gold theme,
      2× gift, daily +100 coins/+3 hints chip, no interstitials; Manage subscription opens Play
- [ ] Subscription **expiry / cancel** (test renewals are minutes long): VIP features go away, Gold
      falls back to Classic
- [ ] **Restore** on a reinstall (same Google account): Remove Ads, VIP, Aurora and the Starter Pack
      flag return; consumables do **not** (the UI explains this)
- [ ] **Refund** a coin purchase from Play Console (Order management → Refund): guest = no change on
      device (client-side only); signed in = a `_refund` grant removes the coins (floored at 0);
      the Starter Pack theme and flag stay after its refund
- [ ] Release build without the RevenueCat key: Shop shows "Store unavailable", nothing crashes

**Signed-in server fulfillment** (`USE_SERVER_FULFILLMENT = true`, webhook deployed)

- [ ] Sign in, then buy `coins_1500`: "Purchase complete. Your items will arrive in a moment.", then
      "Your purchase has arrived!" within seconds; coins added exactly once
- [ ] Firestore: `users/{uid}/grants/{id}` exists with `applied: true`, `claimedBy` = this
      install's id; RevenueCat webhook log shows 200
- [ ] **Transaction id match (DECISIONS P9.4)**: the grant document id equals the **order id**
      (`GPA.…`) in Play Console → Order management, and no second grant or device grant appears
      for that purchase
- [ ] Kill the app right after buying (before the grant arrives): on relaunch the grant is applied
      once (claim recovery, DECISIONS P9.15)
- [ ] Two signed-in devices on the same account: only one device applies the grant; the other gets
      the balance through cloud save
- [ ] Webhook "Send test event" returns 200; a wrong Authorization header returns 401
- [ ] Guest purchase, then sign in: the purchase moves to the account (RevenueCat transfer), no
      duplicate coins

## 5. Notifications

- [ ] No permission prompt on first launch
- [ ] After winning level 3: the soft-prompt sheet; "Not now" → no system dialog; it returns once
      after a win of level 15
- [ ] "Allow" → Android 13+ system dialog; allowed → reminders scheduled (check
      `adb shell dumpsys alarm | grep pourly`, or wait for the slot)
- [ ] Denied twice / "Don't ask again": Settings switches open the app's system settings
- [ ] Notification icon: the white tube glyph (`notification-icon.png`) shows crisply in the
      status bar (not a white square) and is tinted with the accent `#2EC4FF` in the shade
- [ ] `daily_ready` 10:30, `gift_ready` 18:00, `streak_risk` 20:00 (streak ≥ 2): copy localized in
      the Settings language; at most one per day; none 22:00–08:00
- [ ] Comeback reminders after +1, +3, +7, +14 days without opening (advance the clock)
- [ ] Settings toggles "Daily reminders" / "Streak reminders" off: those kinds stop
- [ ] **Deep link, warm**: tap a daily/streak/gift notification with the app in the background →
      Daily screen; a comeback → Home; an in-progress game stays resumable
- [ ] **Deep link, cold**: force-stop, tap the notification → app opens on Daily (after Home's first
      frame); a comeback opens Home
- [ ] Foreground notifications are not shown as banners
- [ ] **Time-zone change** (Settings → Date & time, e.g. UTC+5 → UTC−5), return to the app:
      reminders reschedule to local 10:30 / 18:00 / 20:00 in the new zone; streak and daily date
      follow the local day
- [ ] **DST**: with the device zone set to a DST zone (e.g. America/New_York) and the date before a
      switch, the next day's reminders still fire at local wall-clock times
- [ ] Revoking the permission in Android settings clears the schedule on the next foreground
- [ ] Reboot: scheduled reminders survive (`RECEIVE_BOOT_COMPLETED`); inexact (`bestEffort`) delivery
      within a few minutes is acceptable (DECISIONS P8.1)

## 6. Sign-in and accounts

Needs Firebase configured and the SHA-1/SHA-256 of the signing key in Firebase.

- [ ] **Google sign-in** on a real device: dev build (debug key SHA), `preview` APK (EAS upload key
      SHA) and the Play internal-track install (Play App Signing SHA); a missing SHA shows the
      sign-in error toast (DEVELOPER_ERROR 10), not a crash
- [ ] Cancel the account picker: silent; no Play services (emulator without Google APIs): its own
      toast; airplane mode: network toast
- [ ] Home "Sign in to save your progress" card after level 5 and after the first purchase;
      dismissal rules (DECISIONS P9.21)
- [ ] **Cloud save across two devices**: progress on device A, sign in on device B → B gets the
      higher level, max stars, merged balances (no purchased value lost), union of themes
- [ ] Play offline on B while signed in, then reconnect: changes merge, nothing lost
- [ ] Sign out: the final push completes; local progress stays as the guest copy; Remove Ads/VIP
      leave the device until sign-in or restore
- [ ] App update with a newer cloud `schemaVersion` on the server is never overwritten (simulate by
      editing the document in the console): sync fails quietly, the game keeps working
- [ ] **Account deletion in the app**: Settings → Account → Delete account and data → two confirms →
      Google picker → deleted; Firestore `users/{uid}` (and grants) and the Auth user are gone; the
      app plays as a guest; purchases are kept on the device
- [ ] Picking a different Google account at the confirm step: "choose the same account" message
- [ ] **Account deletion on the web**: `https://<project>.web.app/delete-account` (phone browser
      and desktop) → sign in with Google → tick the checkbox → delete → success message; the
      user and data are gone; the app on the phone falls back to guest on next launch
- [ ] `/privacy`, `/terms`, `/privacy-policy`, `/terms-of-service` load on the Hosting domain;
      Settings → Privacy / Terms / Contact support open the right pages and the mail app
- [ ] Build without Firebase config: "Sign-in unavailable in this build", no sign-in card, no crash

## 7. Accessibility, languages and devices

- [ ] **RTL Arabic**: Settings → Language → العربية → the restart note shows; after a **restart** the
      chrome is mirrored (back buttons, rows, calendar), the board and the Home hero stay LTR,
      numbers and prices are formatted for Arabic
- [ ] Switch back to English: restart → LTR again
- [ ] Every one of the 13 languages: no truncated or overlapping text on Home, Shop, Settings, the
      Win overlay and notification copy (long German/Russian strings on a 360 dp phone)
- [ ] **Colour-blind mode**: symbols on every colour, legible on every theme (dark symbols on the
      yellow, lime and ice colours)
- [ ] **Reduced motion**: Android "Remove animations" (system) and the in-app On/Off override:
      pours ×0.4, no confetti, no bubbles, static hero and gift chip
- [ ] **TalkBack**: every button has a label and role; modal overlays trap focus and announce their
      title; the board's tubes are reachable; coin counters read their value
- [ ] Touch targets ≥ 44 dp everywhere (the Play pre-launch report also checks this)
- [ ] Text contrast on all 8 themes, including the light Candy theme (dark status bar)
- [ ] Android font size "Largest" and display size "Largest": layouts still fit
- [ ] **360 dp phones** and 320 dp emulator: 16-tube boards fit, targets ≥ 44 dp
- [ ] **Tablets**: portrait lock respected, board centred and capped (max tube width 72 dp), no
      stretched art
- [ ] **Foldable**: fold/unfold during a level and during a pour: layout recomputes, no crash, the
      game state is kept
- [ ] Gesture navigation and 3-button navigation: hardware back closes overlays in order (modal →
      pause → stuck → win)
- [ ] Sound plays with the phone on vibrate/silent when media volume is up, follows the volume keys,
      and mixes with music apps; vibration works with the system touch-feedback switch off; the
      in-game Sound and Vibration toggles turn each off

## 8. Soak

- [ ] **2-hour battery/thermal soak** on the low-end device, release build, brightness 50%, Wi-Fi on:
      continuous play including ads; record battery drop (target < 20%/h), device temperature
      (no thermal throttling warning), frame rate at the end vs the start, memory at the end, no
      crash or ANR (check `adb logcat` and Play vitals)
