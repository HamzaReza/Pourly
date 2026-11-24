import type { Skia } from '@shopify/react-native-skia';

/**
 * The Skia API object. Builders take it as a parameter instead of importing the singleton, so the
 * same code runs in the app (`Skia` from the package) and in a headless CanvasKit renderer.
 */
export type SkiaApi = typeof Skia;
