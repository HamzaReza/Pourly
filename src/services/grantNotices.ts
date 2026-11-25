/**
 * Purchases that arrived from the server, waiting to be shown with the Reward overlay
 * (`GrantRewardHost` in the root layout). No React, so the grants listener can raise them.
 */
import type { RewardBundle } from '@/config/economy';
import type { ProductId } from '@/config/products';

export interface GrantNotice {
  readonly id: string;
  readonly productId: ProductId;
  readonly reward: RewardBundle;
}

type Listener = () => void;

let queue: readonly GrantNotice[] = [];
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const pushGrantNotice = (notice: GrantNotice): void => {
  if (queue.some((entry) => entry.id === notice.id)) return;
  queue = [...queue, notice];
  emit();
};

/** The notice on screen, or null. */
export const currentGrantNotice = (): GrantNotice | null => queue[0] ?? null;

export const dismissGrantNotice = (id: string): void => {
  const next = queue.filter((entry) => entry.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
};

export const subscribeGrantNotices = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
