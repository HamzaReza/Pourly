/**
 * Whether a full-screen ad is on screen. Kept apart from `ads.ts` so app-lifecycle code can read
 * it without loading the ad service: an AdMob ad is its own Android activity, so the app goes to
 * the `background` state while it shows, which must not pause the game.
 */
let showing = false;

export const isAdShowing = (): boolean => showing;

export const setAdShowing = (value: boolean): void => {
  showing = value;
};
