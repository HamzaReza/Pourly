/**
 * `getReactNativePersistence` exists at runtime: Metro resolves `@firebase/auth` with the
 * `react-native` export condition (`dist/rn/index.js`), which exports it. The package's `types`
 * entry is listed before its conditions, so TypeScript always reads the browser typings, which
 * omit it. This declaration matches `dist/rn/index.rn.d.ts` of `@firebase/auth` 1.13.
 */
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
