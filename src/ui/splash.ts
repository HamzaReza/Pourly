import * as SplashScreen from 'expo-splash-screen';

let revealed = false;

/**
 * Hides the native splash once the first screen has laid out its content (the game board on a
 * first launch, Home otherwise). Idempotent; the root layout also calls it after a short safety
 * timeout so the splash can never stay up.
 */
export const revealApp = (): void => {
  if (revealed) return;
  revealed = true;
  requestAnimationFrame(() => {
    SplashScreen.hide();
  });
};
