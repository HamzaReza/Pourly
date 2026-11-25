import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/config/constants';
import { currentGrantNotice, dismissGrantNotice } from '@/services/grantNotices';
import { applyServerGrant, recoverClaimedGrants, startGrantsListener } from '@/services/grants';
import {
  grantsToRecover,
  MAX_RECOVERED_GRANTS,
  parseClaimedGrant,
  parseServerGrant,
} from '@/services/grantsCore';
import { useCloudStore } from '@/state/cloudStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import {
  createFakeFirestore,
  fakeServices,
  settle,
  type FakeDoc,
  type FakeFirestore,
} from '../test-utils/fakeFirebase';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const UID = 'uid-1';
const INSTALL = 'install-a';

const progress = () => useProgressStore.getState();
const grantPath = (id: string) => `users/${UID}/grants/${id}`;

const purchase = (productId = 'coins_500', overrides: FakeDoc = {}): FakeDoc => ({
  type: 'purchase',
  transactionId: 'GPA.x',
  productId,
  applied: false,
  appliedAt: null,
  claimedBy: null,
  ...overrides,
});

const refund = (productId = 'coins_500', overrides: FakeDoc = {}): FakeDoc =>
  purchase(productId, { type: 'refund', ...overrides });

const clearQueues = (): void => {
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
  for (let notice = currentGrantNotice(); notice !== null; notice = currentGrantNotice()) {
    dismissGrantNotice(notice.id);
  }
};

let firestore: FakeFirestore;
let stop: () => void = () => undefined;

const start = async (): Promise<void> => {
  stop = startGrantsListener(UID, fakeServices(firestore));
  await settle();
};

const storedProgress = async (): Promise<{ coins: number; processedTransactions: string[] }> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.progress);
  return (JSON.parse(raw ?? '{}') as { state: { coins: number; processedTransactions: string[] } })
    .state;
};

beforeEach(async () => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  firestore = createFakeFirestore();
  useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 100 });
  useCloudStore.setState({ installId: INSTALL });
  await AsyncStorage.clear();
  clearQueues();
});

afterEach(() => {
  jest.restoreAllMocks();
  stop();
  stop = () => undefined;
});

describe('grant parsing', () => {
  it('reads unapplied purchases and refunds of known products', () => {
    expect(parseServerGrant('GPA.1', purchase())).toEqual({
      id: 'GPA.1',
      type: 'purchase',
      productId: 'coins_500',
    });
    expect(parseServerGrant('GPA.1_refund', refund('starter_pack'))).toEqual({
      id: 'GPA.1_refund',
      type: 'refund',
      productId: 'starter_pack',
    });
  });

  it('rejects applied, malformed and unknown grants', () => {
    expect(parseServerGrant('GPA.1', purchase('coins_500', { applied: true }))).toBeNull();
    expect(parseServerGrant('GPA.1', purchase('gems'))).toBeNull();
    expect(parseServerGrant('GPA.1', purchase('coins_500', { type: 'gift' }))).toBeNull();
    expect(parseServerGrant('', purchase())).toBeNull();
    expect(parseServerGrant('GPA.1', null)).toBeNull();
  });

  it('reads only grants claimed by the given install', () => {
    const claimed = purchase('coins_500', { applied: true, claimedBy: INSTALL });
    expect(parseClaimedGrant('GPA.1', claimed, INSTALL)?.id).toBe('GPA.1');
    expect(parseClaimedGrant('GPA.1', claimed, 'install-b')).toBeNull();
    expect(parseClaimedGrant('GPA.1', purchase(), INSTALL)).toBeNull();
  });

  it('recovers only claimed grants missing from processedTransactions', () => {
    const grants = [
      { id: 'A', type: 'purchase', productId: 'coins_500' },
      { id: 'B', type: 'purchase', productId: 'coins_500' },
    ] as const;
    expect(grantsToRecover(grants, ['A']).map((grant) => grant.id)).toEqual(['B']);
    expect(grantsToRecover(grants, ['A', 'B'])).toEqual([]);
  });
});

describe('grants listener', () => {
  it('claims a new grant for this install, applies it once and persists it', async () => {
    firestore.docs.set(grantPath('GPA.1'), purchase('coins_1500'));
    await start();
    expect(progress().coins).toBe(1600);
    expect(progress().processedTransactions).toContain('GPA.1');
    const stored = firestore.docs.get(grantPath('GPA.1'));
    expect(stored).toMatchObject({ applied: true, claimedBy: INSTALL });
    expect(typeof stored?.appliedAt).toBe('number');
    const persisted = await storedProgress();
    expect(persisted.coins).toBe(1600);
    expect(persisted.processedTransactions).toContain('GPA.1');
  });

  it('shows a toast and the reward overlay for a positive grant', async () => {
    firestore.docs.set(grantPath('GPA.1'), purchase('starter_pack'));
    await start();
    expect(currentToast()?.key).toBe('cloud.grantArrived');
    expect(currentGrantNotice()).toEqual({
      id: 'GPA.1',
      productId: 'starter_pack',
      reward: { coins: 1500, hints: 10, undos: 10 },
    });
    expect(progress().starterPackPurchased).toBe(true);
    expect(progress().ownedThemes).toContain('aurora');
  });

  it('marks a grant the device already made as applied without granting again', async () => {
    useProgressStore.setState({ processedTransactions: ['GPA.dev'] });
    firestore.docs.set(grantPath('GPA.dev'), purchase());
    await start();
    expect(progress().coins).toBe(100);
    expect(firestore.docs.get(grantPath('GPA.dev'))?.applied).toBe(true);
    expect(currentGrantNotice()).toBeNull();
  });

  it('never applies a grant twice when it is delivered again', async () => {
    firestore.docs.set(grantPath('GPA.1'), purchase());
    await start();
    firestore.docs.set(grantPath('GPA.1'), purchase());
    firestore.notify();
    await settle();
    expect(progress().coins).toBe(600);
  });

  it('skips a grant another install claimed first', async () => {
    firestore.docs.set(
      grantPath('GPA.2'),
      purchase('coins_4000', { applied: true, claimedBy: 'b' }),
    );
    await start();
    expect(progress().coins).toBe(100);
  });

  it('applies a refund once, flooring the balance at 0', async () => {
    useProgressStore.setState({ coins: 200 });
    firestore.docs.set(grantPath('GPA.1_refund'), refund());
    await start();
    expect(progress().coins).toBe(0);
    expect(currentToast()?.key).toBe('cloud.refundApplied');
    firestore.docs.set(grantPath('GPA.1_refund'), refund());
    useProgressStore.setState({ coins: 50 });
    firestore.notify();
    await settle();
    expect(progress().coins).toBe(50);
  });

  it('leaves grants for unknown products unapplied', async () => {
    firestore.docs.set(grantPath('GPA.x'), purchase('gems'));
    await start();
    expect(firestore.docs.get(grantPath('GPA.x'))?.applied).toBe(false);
  });

  it('keeps a grant unapplied when the claim fails, and applies it on the next snapshot', async () => {
    firestore.failTransactions(1);
    firestore.docs.set(grantPath('GPA.1'), purchase());
    await start();
    expect(progress().coins).toBe(100);
    expect(firestore.docs.get(grantPath('GPA.1'))?.applied).toBe(false);
    firestore.notify();
    await settle();
    expect(progress().coins).toBe(600);
  });

  it('stops listening when stopped', async () => {
    await start();
    expect(firestore.listenerCount()).toBe(1);
    stop();
    expect(firestore.listenerCount()).toBe(0);
    firestore.docs.set(grantPath('GPA.1'), purchase());
    firestore.notify();
    await settle();
    expect(progress().coins).toBe(100);
  });
});

describe('recovery of grants claimed by this install', () => {
  it('applies a grant claimed before the app was killed (claim committed, apply lost)', async () => {
    // First run: the claim commits, then the app dies before the local apply.
    firestore.docs.set(grantPath('GPA.1'), purchase('coins_1500'));
    const original = progress().fulfillTransaction;
    useProgressStore.setState({
      fulfillTransaction: () => {
        throw new Error('process killed');
      },
    });
    await start();
    stop();
    useProgressStore.setState({ fulfillTransaction: original });
    expect(firestore.docs.get(grantPath('GPA.1'))).toMatchObject({
      applied: true,
      claimedBy: INSTALL,
    });

    // Relaunch with the progress the device had stored (nothing applied).
    useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 100 });
    await start();
    expect(progress().coins).toBe(1600);
    expect(progress().processedTransactions).toContain('GPA.1');
    expect((await storedProgress()).processedTransactions).toContain('GPA.1');

    // A later launch finds it applied and grants nothing more.
    stop();
    await start();
    expect(progress().coins).toBe(1600);
  });

  it('ignores claims by other installs and claims already applied here', async () => {
    useProgressStore.setState({ processedTransactions: ['GPA.done'] });
    firestore.docs.set(
      grantPath('GPA.done'),
      purchase('coins_500', { applied: true, claimedBy: INSTALL, appliedAt: 5 }),
    );
    firestore.docs.set(
      grantPath('GPA.other'),
      purchase('coins_500', { applied: true, claimedBy: 'b', appliedAt: 6 }),
    );
    expect(await recoverClaimedGrants(UID, fakeServices(firestore), INSTALL)).toBe(0);
    expect(progress().coins).toBe(100);
  });

  it('restores a purchase before its refund', async () => {
    useProgressStore.setState({ coins: 0 });
    firestore.docs.set(
      grantPath('GPA.1'),
      purchase('coins_500', { applied: true, claimedBy: INSTALL, appliedAt: 10 }),
    );
    firestore.docs.set(
      grantPath('GPA.1_refund'),
      refund('coins_500', { applied: true, claimedBy: INSTALL, appliedAt: 20 }),
    );
    expect(await recoverClaimedGrants(UID, fakeServices(firestore), INSTALL)).toBe(2);
    expect(progress().coins).toBe(0);
    expect(progress().processedTransactions).toEqual(['GPA.1', 'GPA.1_refund']);
  });

  it(`checks only the latest ${MAX_RECOVERED_GRANTS} claims`, async () => {
    for (let i = 0; i < MAX_RECOVERED_GRANTS + 5; i += 1) {
      firestore.docs.set(
        grantPath(`GPA.${i}`),
        purchase('coins_500', { applied: true, claimedBy: INSTALL, appliedAt: i }),
      );
    }
    expect(await recoverClaimedGrants(UID, fakeServices(firestore), INSTALL)).toBe(
      MAX_RECOVERED_GRANTS,
    );
    expect(progress().processedTransactions).not.toContain('GPA.0');
    expect(progress().processedTransactions).toContain(`GPA.${MAX_RECOVERED_GRANTS + 4}`);
  });

  it('keeps the listener running when the recovery query fails', async () => {
    firestore.failQueries(1);
    firestore.docs.set(grantPath('GPA.1'), purchase());
    await start();
    expect(progress().coins).toBe(600);
  });
});

describe('applyServerGrant', () => {
  it('records a second Starter Pack without granting its items again', () => {
    useProgressStore.setState({ starterPackPurchased: true });
    applyServerGrant({ id: 'GPA.sp2', type: 'purchase', productId: 'starter_pack' }, NOW);
    expect(progress().coins).toBe(100);
    expect(progress().processedTransactions).toContain('GPA.sp2');
    expect(currentGrantNotice()).toBeNull();
  });
});
