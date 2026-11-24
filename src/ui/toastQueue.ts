/**
 * Toast queue (no React): `showToast` enqueues a localized message; the `ToastHost` mounted in the
 * root layout shows one at a time. Lives outside React so services can raise toasts.
 */
import type { TranslationKey, TranslationParams } from '@/i18n/keys';

export interface ToastItem {
  readonly id: number;
  readonly key: TranslationKey;
  readonly params?: TranslationParams;
}

/** Most toasts waiting at once; older ones are dropped first. */
export const MAX_QUEUED_TOASTS = 3;

type Listener = () => void;

let queue: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

/** Queues a toast. A message identical to the last queued one is not repeated. */
export const showToast = (key: TranslationKey, params?: TranslationParams): void => {
  const last = queue[queue.length - 1];
  if (
    last !== undefined &&
    last.key === key &&
    JSON.stringify(last.params) === JSON.stringify(params)
  ) {
    return;
  }
  const item: ToastItem = { id: nextId, key, params };
  nextId += 1;
  queue = [...queue, item].slice(-MAX_QUEUED_TOASTS);
  emit();
};

/** The toast on screen, or null. */
export const currentToast = (): ToastItem | null => queue[0] ?? null;

/** Removes the toast with `id` (the host calls this when it times out). */
export const dismissToast = (id: number): void => {
  const next = queue.filter((item) => item.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
};

export const subscribeToasts = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
